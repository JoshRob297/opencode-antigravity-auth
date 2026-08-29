export interface MenuItem<T = string> {
    label: string;
    value: T;
    hint?: string;
    disabled?: boolean;
    separator?: boolean;
    /** Non-selectable label row (section heading). */
    kind?: 'heading';
    color?: 'red' | 'green' | 'yellow' | 'cyan';
}
export interface SelectOptions {
    message: string;
    subtitle?: string;
    /** Override the help line shown at the bottom of the menu. */
    help?: string;
    /**
     * Clear the terminal before each render (opt-in).
     * Useful for nested flows where previous logs make menus feel cluttered.
     */
    clearScreen?: boolean;
}
export declare function select<T>(items: MenuItem<T>[], options: SelectOptions): Promise<T | null>;
//# sourceMappingURL=select.d.ts.map