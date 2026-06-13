const defaultSettings: ISettings = {
  tutorialIndex: 0,

  currencySymbol: '$',
  ledgerFile: 'transactions.ledger',

  assetAccountsPrefix: 'Assets',
  expenseAccountsPrefix: 'Expenses',
  incomeAccountsPrefix: 'Income',
  liabilityAccountsPrefix: 'Liabilities',

  payeeAccountDefaults: {},
};

export interface ISettings {
  tutorialIndex: number;

  currencySymbol: string;
  ledgerFile: string;

  assetAccountsPrefix: string;
  expenseAccountsPrefix: string;
  incomeAccountsPrefix: string;
  liabilityAccountsPrefix: string;

  /**
   * payeeAccountDefaults maps a payee to the list of account names which should
   * be pre-filled when that payee is selected in the transaction form. The
   * accounts are stored in expense-line order; an empty string indicates that
   * the corresponding line should be left blank. This is set explicitly by the
   * user with the "Set as default for Payee" button and takes precedence over
   * the accounts inferred from the payee's most recent transaction.
   */
  payeeAccountDefaults: Record<string, string[]>;
}

export const settingsWithDefaults = (
  settings: Partial<ISettings>,
): ISettings => {
  const merged = { ...defaultSettings, ...settings };
  return {
    ...merged,
    // Clone so the shared default object is never mutated in place.
    payeeAccountDefaults: { ...merged.payeeAccountDefaults },
  };
};
