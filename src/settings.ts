const defaultSettings: ISettings = {
  tutorialIndex: 0,

  currencySymbol: '$',
  ledgerFile: 'transactions.ledger',

  assetAccountsPrefix: 'Assets',
  expenseAccountsPrefix: 'Expenses',
  incomeAccountsPrefix: 'Income',
  liabilityAccountsPrefix: 'Liabilities',

  holidayCountry: '',
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
   * holidayCountry is the ISO country code used to look up public holidays when
   * adjusting a recurring transaction's date onto a working day. An empty string
   * means only weekends are treated as non-working days.
   */
  holidayCountry: string;
}

export const settingsWithDefaults = (
  settings: Partial<ISettings>,
): ISettings => ({ ...defaultSettings, ...settings });
