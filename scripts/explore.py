#!/usr/bin/env python3
"""
视频号量化投流助手 · 第一阶段 · 只读探索采集器
======================================================

做四件事:
  1. 用 Playwright 自带 Chromium(非系统 Chrome)启动有头/无头持久化会话;
  2. 监听所有页面的 XHR/Fetch 响应,把原始 body 落到私有目录(全量记录,不静默吞错);
  3. 在每次页面 load、SNAP 信号、STOP 终态时保存渲染后 DOM(用于提取内嵌数据);
  4. 由人工在浏览器里操作(扫码、翻页、打开详情),脚本只观察。

严格只读:不创建/追加/暂停/终止投放,不提交表单,不发起支付。
结束采集:创建 STOP 文件 / 达到最大时长 / SIGTERM。中途抓 DOM:创建 SNAP 文件。

用法(探索期,Mac,有头):
    .venv/bin/python scripts/explore.py --platform commerce
用法(VPS 长跑,无头):
    .venv/bin/python scripts/explore.py --platform commerce --headless --max-seconds 600
"""
import argparse
import base64
import hashlib
import json
import signal
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qsl

from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw-private"
PROFILE_DIR = Path.home() / ".wxadcopilot" / "browser-profiles" / "operator-01"

# 这些 query 参数名连 key 都不记录
SENSITIVE_QUERY_KEYS = {
    "token", "access_token", "refresh_token", "ticket", "signature",
    "sign", "sessionid", "session_id", "csrf", "csrftoken", "auth",
    "key", "apikey", "api_key", "cookie", "authorization", "passwd",
    "password", "uin", "vid", "keyindex",
}

START_URLS = {
    "commerce": "https://store.weixin.qq.com",
    "promote": "https://channels.weixin.qq.com/promote",
}

# 注入到每个文档(含 iframe)的脚本:hook JSON.parse,捕获解密后的大对象(compass 加密攻坚用)
# 仅存 window.__captured__(轻量,不写 localStorage -- sandbox iframe 写 localStorage 易致页面崩溃)
INIT_SCRIPT = """
(function(){
  if (window.__cap_installed) return;
  window.__cap_installed = true;
  window.__captured__ = [];
  var _parse = JSON.parse;
  JSON.parse = function(s, rev){
    var r;
    try { r = _parse.call(this, s, rev); } catch(e) { return _parse.call(this, s, rev); }
    try {
      if (r && typeof r === 'object') {
        var str = JSON.stringify(r);
        if (str && str.length > 800) {
          window.__captured__.push(str);
          if (window.__captured__.length > 300) window.__captured__.shift();
        }
      }
    } catch(e){}
    return r;
  };
})();
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def desensitize_url(url: str) -> str:
    """保留 scheme+host+path;query 只留 key 名,且抹掉敏感 key。"""
    try:
        p = urlparse(url)
    except Exception:
        return "<invalid-url>"
    keys = [k for k, _ in parse_qsl(p.query, keep_blank_values=True)
            if k.lower() not in SENSITIVE_QUERY_KEYS]
    query = "&".join(keys)
    base = f"{p.scheme}://{p.netloc}{p.path}"
    return f"{base}?{query}" if query else base


def query_keys_of(url: str) -> list:
    return [k for k, _ in parse_qsl(urlparse(url).query)
            if k.lower() not in SENSITIVE_QUERY_KEYS]


def post_data_keys(req) -> list:
    if req.method != "POST":
        return []
    pd = req.post_data
    if not pd:
        return []
    try:
        pj = json.loads(pd)
        if isinstance(pj, dict):
            return list(pj.keys())
    except Exception:
        pass
    return []


def shape(obj):
    """递归取结构(只留 key 与类型),用于 schema_hash 归类。"""
    if isinstance(obj, dict):
        return {k: shape(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [shape(obj[0])] if obj else []
    return type(obj).__name__


def schema_hash(obj) -> str:
    try:
        h = hashlib.sha1(
            json.dumps(shape(obj), sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()[:12]
        return h
    except Exception:
        return "unknown"


def main():
    ap = argparse.ArgumentParser(description="投流平台只读探索采集器")
    ap.add_argument("--platform", default="commerce",
                    choices=["commerce", "promote"])
    ap.add_argument("--start-url", default=None, help="起始页,默认按 platform 选择")
    ap.add_argument("--headless", action="store_true", help="无头模式(VPS 用)")
    ap.add_argument("--max-seconds", type=int, default=1800, help="最大采集时长(秒),默认 1800")
    ap.add_argument("--session", default=None, help="会话名,默认按时间戳")
    args = ap.parse_args()

    start_url = args.start_url or START_URLS[args.platform]
    session = args.session or datetime.now().strftime(f"{args.platform}-%Y%m%d-%H%M%S")
    session_dir = RAW_DIR / session
    session_dir.mkdir(parents=True, exist_ok=True)
    stop_file = session_dir / "STOP"
    snap_file = session_dir / "SNAP"
    nav_file = session_dir / "NAV"
    reload_file = session_dir / "RELOAD"
    click_file = session_dir / "CLICK"
    capture_file = session_dir / "CAPTURE"
    for f in (stop_file, snap_file, nav_file, reload_file, click_file, capture_file):
        if f.exists():
            f.unlink()
    manifest_path = session_dir / "manifest.jsonl"
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    manifest_fh = manifest_path.open("a", encoding="utf-8")
    state = {"idx": 0, "stop": False}

    def request_stop(*_a):
        state["stop"] = True
        try:
            stop_file.touch()
        except Exception:
            pass

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    def on_response(response):
        try:
            req = response.request
            rtype = req.resource_type
            ctype = response.headers.get("content-type", "")
            url_d = desensitize_url(response.url)
            # 取 body:xhr/fetch/json/protobuf/html(含 SSR 文档)
            want_body = (rtype in ("xhr", "fetch") or "json" in ctype
                         or "protobuf" in ctype or "html" in ctype)
            body = None
            body_err = None
            if want_body:
                try:
                    body = response.body()
                except Exception as e:
                    body_err = f"{type(e).__name__}: {str(e)[:120]}"
            parsed = None
            if body:
                try:
                    parsed = json.loads(body)
                except Exception:
                    parsed = None
            is_pb = "protobuf" in ctype or "x-protobuf" in ctype

            state["idx"] += 1
            idx = state["idx"]
            saved = False
            fname = None
            if body:
                ext = "json" if parsed is not None else ("pb" if is_pb else "bin")
                fname = f"{idx:04d}_{req.method}.{ext}"
                try:
                    (session_dir / fname).write_bytes(body)
                    saved = True
                except Exception as e:
                    body_err = (body_err or "") + " write:" + str(e)[:80]

            rec = {
                "idx": idx,
                "captured_at": now_iso(),
                "platform": args.platform,
                "page_url": url_d,
                "method": req.method,
                "status": response.status,
                "content_type": ctype,
                "resource_type": rtype,
                "body_size": len(body) if body else 0,
                "is_json": parsed is not None,
                "is_protobuf": is_pb,
                "saved": saved,
                "sample_file": str(session_dir / fname) if fname else None,
                "query_keys": query_keys_of(response.url),
                "post_data_keys": post_data_keys(req),
                "schema_hash": schema_hash(parsed) if parsed is not None else None,
                "body_error": body_err,
            }
            manifest_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            manifest_fh.flush()

            if want_body:
                tag = "JSON" if parsed is not None else ("PB" if is_pb else "RAW")
                err = f" ERR={body_err}" if body_err else ""
                sz = len(body) if body else 0
                print(f"[{idx:04d}] {req.method:5s} {response.status} {rtype:6s} "
                      f"{tag} {sz:>8d}B{err}  {url_d[:100]}", flush=True)
        except Exception as e:
            print(f"[capture-error] {e}", flush=True)

    def snapshot_pages(ctx, tag):
        """保存所有页面及所有 frame(含 wujie 微前端 iframe)的渲染后 DOM。"""
        ts = datetime.now().strftime("%H%M%S")
        for pi, pg in enumerate(ctx.pages):
            for fi, fr in enumerate(pg.frames):
                try:
                    furl = fr.url
                    html = fr.content()
                    if len(html) < 200:
                        continue
                    fname = f"dom-{tag}-p{pi}f{fi}-{ts}.html"
                    (session_dir / fname).write_text(html, encoding="utf-8")
                    print(f"[snap-{tag}] p{pi}f{fi} {len(html):>8d}B  "
                          f"{desensitize_url(furl)[:80]} -> {fname}", flush=True)
                except Exception as e:
                    print(f"[snap-{tag}-err] p{pi}f{fi}: {e}", flush=True)

    print("=" * 74, flush=True)
    print(f"平台: {args.platform}   会话: {session}", flush=True)
    print(f"模式: {'headless' if args.headless else 'headed(可见)'}", flush=True)
    print(f"原始响应目录: {session_dir}", flush=True)
    print(f"清单文件:     {manifest_path}", flush=True)
    print(f"结束: 创建 STOP  |  抓 DOM: 创建 SNAP  |  超时: {args.max_seconds}s", flush=True)
    print("=" * 74, flush=True)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=args.headless,
            viewport={"width": 1440, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx.on("response", on_response)
        ctx.add_init_script(INIT_SCRIPT)

        def on_page_load(pg):
            try:
                time.sleep(1.2)  # 等 SPA 渲染内嵌数据
                snapshot_pages(ctx, "load")
            except Exception as e:
                print(f"[load-snap-err] {e}", flush=True)

        def on_new_page(pg):
            print(f"[new-page] {desensitize_url(pg.url)}", flush=True)
            pg.on("load", lambda: on_page_load(pg))

        ctx.on("page", on_new_page)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.on("load", lambda: on_page_load(page))
        try:
            page.goto(start_url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print(f"[goto-warning] {start_url} 加载异常({e}),可手动在地址栏导航。", flush=True)

        print("\n浏览器已打开。请在窗口内操作(全程只读,勿创建/提交投放):\n"
              "  1) 未登录则扫码登录;\n"
              "  2) 进入【内容管理 / 动态管理 / 视频列表】;\n"
              "  3) 等首屏加载完 -> 刷新一次;\n"
              "  4) 翻到下一页;\n"
              "  5) 切换一次排序或日期范围(若无则跳过);\n"
              "  6) 打开一条视频详情(若无独立详情页则跳过);\n"
              "  7) 完成后告诉我(我会创建 STOP 结束)。\n"
              "  随时可让我创建 SNAP 文件抓取当前页面 DOM。\n",
              flush=True)

        deadline = time.time() + args.max_seconds
        while True:
            time.sleep(2)
            if click_file.exists():
                _t = click_file.read_text(encoding="utf-8").strip()
                try:
                    click_file.unlink()
                except Exception:
                    pass
                _clicked = False
                for _fr in page.frames:
                    try:
                        _loc = _fr.get_by_text(_t, exact=False).first
                        _loc.click(timeout=3000)
                        print(f"[click] '{_t}' @ {_fr.url[:50]}", flush=True)
                        _clicked = True
                        time.sleep(1.0)
                        break
                    except Exception:
                        continue
                if not _clicked:
                    print(f"[click-err] '{_t}' 未找到", flush=True)
            if capture_file.exists():
                try:
                    capture_file.unlink()
                except Exception:
                    pass
                all_caps = []
                for _fr in page.frames:
                    try:
                        _caps = _fr.evaluate("() => (window.__captured__ || [])")
                        if _caps:
                            all_caps.append((_fr.url, list(_caps)))
                    except Exception:
                        pass
                if all_caps:
                    import datetime as _dt
                    _ts = _dt.datetime.now().strftime("%H%M%S")
                    _fname = session_dir / f"captured-{_ts}.json"
                    json.dump([{"frame": u, "data_list": c} for u, c in all_caps],
                              open(_fname, "w", encoding="utf-8"), ensure_ascii=False)
                    _n = sum(len(c) for _, c in all_caps)
                    print(f"[capture] {_n} 条明文(来自 {len(all_caps)} frame)-> {_fname.name}",
                          flush=True)
                else:
                    print("[capture] 无明文(JSON.parse 未捕到或 compass 不走 JSON.parse)", flush=True)
            if nav_file.exists():
                _u = nav_file.read_text(encoding="utf-8").strip()
                try:
                    nav_file.unlink()
                except Exception:
                    pass
                try:
                    page.goto(_u, wait_until="domcontentloaded", timeout=60000)
                    print(f"[nav] -> {desensitize_url(_u)}", flush=True)
                except Exception as e:
                    print(f"[nav-err] {e}", flush=True)
            if reload_file.exists():
                try:
                    reload_file.unlink()
                except Exception:
                    pass
                try:
                    page.reload(wait_until="domcontentloaded", timeout=60000)
                    print("[reload] 已刷新", flush=True)
                except Exception as e:
                    print(f"[reload-err] {e}", flush=True)
            if snap_file.exists():
                try:
                    snap_file.unlink()
                except Exception:
                    pass
                snapshot_pages(ctx, "snap")
            if stop_file.exists() or state["stop"]:
                print("收到结束信号,关闭浏览器...", flush=True)
                snapshot_pages(ctx, "final")
                break
            if time.time() > deadline:
                print("达到最大时长,关闭浏览器...", flush=True)
                snapshot_pages(ctx, "timeout")
                break
        ctx.close()
    manifest_fh.close()
    print(f"\n采集结束。共 {state['idx']} 条业务响应。清单: {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
