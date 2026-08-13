# commerce 端(微信小店/电商罗盘)· 页面地图

> 域名 `store.weixin.qq.com`。**两套独立后端,加密性不同:**
> - `shop-faas/mmeckolbasenode/*`(达人主页) -- **明文 JSON**
> - `shop-faas/mmecnodecompasscommon/*`(电商罗盘 compass) -- **全加密 `__payload__`**
>
> 登录:**talent/ 与 compass 是两套独立扫码登录**,互不通用。

## 页面:达人主页 `/talent/home`

- **URL:** `https://store.weixin.qq.com/talent/`(入口)-> `/talent/home`
- **登录:** talent 扫码登录(一套)
- **后端:** `mmeckolbasenode` -- **明文**
- **可见数据:** 达人账号信息、等级、橱窗 Top3 商品、绑定渠道、消息红点、佣金/发票、直播状态等
- **价值:** 账号/橱窗/商品级元数据(明文,可采);非成交明细

## 页面:电商罗盘 - 短视频明细 `/compass/feed/list`

- **URL:** `https://store.weixin.qq.com/compass/feed/list?uniqId=...`
- **登录:** **compass 独立扫码登录**(与 talent 不通用;未登录跳 `/compass/login`)
- **后端:** `mmecnodecompasscommon`(compass) -- **全加密**
- **可见数据:** 短视频带货明细(每条视频的成交/GMV/订单/退款等)+ 每条视频的详情链接
- **⚠️ 阻塞:** 数据接口响应为加密 `__payload__`,**无法直接读字段**。与 creator 带货数据页(`cargo/transcation`)是**同一套加密**(密文前缀 `1f7a3670...` 一致)。
- **影响:** **跨端 exportId 验证被阻塞**(读不到 feed/list 的视频 ID 与 creator 对比);单视频成交归因(M-06~M-11)被阻塞。
- **解密方案:** 见 [api-catalog.md](api-catalog.md) 末尾 + [../../exploration-log.md](../../exploration-log.md)。

## 待探索(commerce)

- 短视频明细的**单视频详情页**(页面有详情链接,数据同样在 compass 加密后端)
- compass 加密解密(攻坚,解锁后即可读 feed/list + 详情 + 跨端验证)
- 达人主页 `mmeckolbasenode` 其余明文接口的字段细化(优先级低)
