export type AccountStatus = 'active' | 'rate-limited' | 'expired' | 'verification-required' | 'unknown';
export interface AccountInfo {
    email?: string;
    index: number;
    addedAt?: number;
    lastUsed?: number;
    status?: AccountStatus;
    isCurrentAccount?: boolean;
    enabled?: boolean;
}
export type AuthMenuAction = {
    type: 'add';
} | {
    type: 'select-account';
    account: AccountInfo;
} | {
    type: 'delete-all';
} | {
    type: 'check';
} | {
    type: 'verify';
} | {
    type: 'verify-all';
} | {
    type: 'configure-models';
} | {
    type: 'cancel';
};
export type AccountAction = 'back' | 'delete' | 'refresh' | 'toggle' | 'verify' | 'cancel';
export declare function showAuthMenu(accounts: AccountInfo[]): Promise<AuthMenuAction>;
export declare function showAccountDetails(account: AccountInfo): Promise<AccountAction>;
export { isTTY } from './ansi';
//# sourceMappingURL=auth-menu.d.ts.map