import { type AccountStatus } from "./ui/auth-menu";
export declare function promptProjectId(): Promise<string>;
export declare function promptAddAnotherAccount(currentCount: number): Promise<boolean>;
export type LoginMode = "add" | "fresh" | "manage" | "check" | "verify" | "verify-all" | "cancel";
export interface ExistingAccountInfo {
    email?: string;
    index: number;
    addedAt?: number;
    lastUsed?: number;
    status?: AccountStatus;
    isCurrentAccount?: boolean;
    enabled?: boolean;
}
export interface LoginMenuResult {
    mode: LoginMode;
    deleteAccountIndex?: number;
    refreshAccountIndex?: number;
    toggleAccountIndex?: number;
    verifyAccountIndex?: number;
    verifyAll?: boolean;
    deleteAll?: boolean;
}
export declare function promptLoginMode(existingAccounts: ExistingAccountInfo[]): Promise<LoginMenuResult>;
export { isTTY } from "./ui/auth-menu";
export type { AccountStatus } from "./ui/auth-menu";
//# sourceMappingURL=cli.d.ts.map