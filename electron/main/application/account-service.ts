import type { Account, AccountInput } from "../../shared/types.js";
import { accountRepository } from "../infrastructure/persistence/repositories.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";

export class AccountService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  list(): Account[] {
    return accountRepository.list();
  }

  create(input: AccountInput): Account {
    this.validate(input);
    return accountRepository.create(input);
  }

  update(id: string, input: AccountInput): Account {
    this.validate(input);
    return accountRepository.update(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.runtimes.destroyAccount(id);
    accountRepository.delete(id);
  }

  private validate(input: AccountInput): void {
    if (!input.name?.trim()) throw new Error("账号名称不能为空");
  }
}
