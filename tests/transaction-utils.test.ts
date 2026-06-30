import { EnhancedTransaction, FileBlock, parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import {
  filterByAccount,
  filterByPayeeExact,
  filterBySearch,
  filterByTag,
  filterTransactions,
  formatComment,
  formatTransaction,
  getAccountsForPayee,
  getCurrency,
  getMemoFromComment,
  getTagsFromComment,
  getTotal,
  getTransactionTag,
  makeAccountTree,
  Node,
  sanitizeTag,
  sortAccountTree,
  sortTransactionsForDisplay,
} from '../src/transaction-utils';
import { assert } from 'console';
import * as moment from 'moment';

window.moment = moment;

const emptyBlock: FileBlock = {
  firstLine: -1,
  lastLine: -1,
  block: '',
};

describe('formatting a transaction into ledger', () => {
  test('a transaction with a line comment and reconciliation symbol', () => {
    const contents = `2021-04-20 Obsidian
  ! e:Spending Money    $20.00    ; Inline comment
    ; line comment
    b:CreditUnion`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    if (txCache.transactions.length !== 1 || !txCache.transactions[0]) {
      assert(false);
      return; // Appease the type checker
    }
    const output = formatTransaction(txCache.transactions[0], '$');
    expect(output).toEqual('\n' + contents);
  });
  test('a transaction with non-default currency', () => {
    const contents = `2021-04-20 Obsidian
  * e:Spending Money    €20.00
  ! b:CreditUnion`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    if (txCache.transactions.length !== 1 || !txCache.transactions[0]) {
      assert(false);
      return; // Appease the type checker
    }
    const output = formatTransaction(txCache.transactions[0], '$');
    expect(output).toEqual('\n' + contents);
  });
  test('a transaction with a memo and a tag in the comment', () => {
    const contents = `2021-04-20 Obsidian    ; lunch with team #work
  ! e:Spending Money    $20.00
    b:CreditUnion`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    if (txCache.transactions.length !== 1 || !txCache.transactions[0]) {
      assert(false);
      return; // Appease the type checker
    }
    expect(txCache.transactions[0].value.comment).toEqual(
      'lunch with team #work',
    );
    const output = formatTransaction(txCache.transactions[0], '$');
    expect(output).toEqual('\n' + contents);
  });
  test('when the tx has the minimum allowed values', () => {
    const tx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021/12/31',
        payee: 'test-payee',
        expenselines: [
          {
            account: 'test-account-1',
            dealiasedAccount: 'test-account-1',
            amount: 10.0,
            currency: '$',
            reconcile: '',
          },
          {
            account: 'test-account-2',
            dealiasedAccount: 'test-account-2',
            amount: -10.0,
            currency: '$',
            reconcile: '',
          },
        ],
      },
    };

    const expected = [
      '',
      '2021/12/31 test-payee',
      '    test-account-1    $10.00',
      '    test-account-2',
    ].join('\n');

    const result = formatTransaction(tx, '$');
    expect(result).toEqual(expected);
  });
});

describe('getTotal()', () => {
  test('simple test', () => {
    const tx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021/12/04',
        payee: 'Testing',
        expenselines: [
          {
            amount: 40,
            currency: '$',
            account: 'account1',
            dealiasedAccount: 'account1',
            reconcile: '',
          },
          {
            account: 'account2',
            dealiasedAccount: 'account2',
            amount: 20,
            reconcile: '',
          },
          {
            amount: -60,
            currency: '$',
            account: 'account3',
            dealiasedAccount: 'account3',
            reconcile: '',
          },
        ],
      },
    };
    const result = getTotal(tx, '$');
    expect(result).toEqual('$60.00');
  });
});

describe('getCurrency()', () => {
  test('When the first expense line has a currency', () => {
    const tx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021/12/04',
        payee: 'Testing',
        expenselines: [
          {
            amount: 40,
            currency: 'L',
            account: 'account1',
            dealiasedAccount: 'account1',
            reconcile: '',
          },
          {
            amount: -40,
            account: 'account3',
            dealiasedAccount: 'account3',
            reconcile: '',
          },
        ],
      },
    };
    const result = getCurrency(tx, '$');
    expect(result).toEqual('L');
  });
  test('When the second expense line has a currency', () => {
    const tx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021/12/04',
        payee: 'Testing',
        expenselines: [
          {
            amount: -40,
            account: 'account1',
            dealiasedAccount: 'account1',
            reconcile: '',
          },
          {
            amount: 40,
            currency: 'L',
            account: 'account3',
            dealiasedAccount: 'account3',
            reconcile: '',
          },
        ],
      },
    };
    const result = getCurrency(tx, '$');
    expect(result).toEqual('L');
  });
  test('When the transaction does not specify a currency', () => {
    const tx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021/12/04',
        payee: 'Testing',
        expenselines: [
          {
            amount: 40,
            account: 'account1',
            dealiasedAccount: 'account1',
            reconcile: '',
          },
          {
            amount: -40,
            account: 'account3',
            dealiasedAccount: 'account3',
            reconcile: '',
          },
        ],
      },
    };
    const result = getCurrency(tx, '$');
    expect(result).toEqual('$');
  });
});

describe('makeAccountTree()', () => {
  test('When the tree is empty', () => {
    const input: Node[] = [];
    makeAccountTree(input, 'e:Food:Grocery');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
  test('When adding to existing leaf', () => {
    const input = [
      { id: 'e', account: 'e', subRows: [{ id: 'e:Food', account: 'Food' }] },
    ];
    makeAccountTree(input, 'e:Food:Grocery');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
  test('When adding a new branch', () => {
    const input = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    makeAccountTree(input, 'e:Bills:Electricity');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
});

describe('sortAccountTree()', () => {
  test('Basic sort', () => {
    const input = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
        ],
      },
      { id: 'alpha', account: 'alpha' },
    ];
    sortAccountTree(input);
    const expected = [
      { id: 'alpha', account: 'alpha' },
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
});

describe('sortTransactionsForDisplay()', () => {
  const settings = settingsWithDefaults({});

  test('newest date first, most recently added first within a day', () => {
    const file = [
      '2026-06-15 Kino',
      '  Ausgaben:Freizeit    €10.40',
      '  Vermögen:Bank:Wise',
      '',
      '2026-06-18 Eschborn',
      '  Ausgaben:Freizeit:Sport    €115.00',
      '  Vermögen:Bank:Wise',
      '',
      '2026-06-18 Scalable',
      '  Vermögen:Bank:Scalable    €3.18',
      '  Einnahmen:Anlagen',
      '',
      '2026-06-18 Aliexpress',
      '  Ausgaben:Freizeit:Sonstiges    €7.00',
      '  Vermögen:Bank:Sparkasse',
    ].join('\n');
    const cache = parse(file, settings);
    expect(cache.parsingErrors).toEqual([]);

    const ordered = sortTransactionsForDisplay(cache.transactions).map(
      (t) => t.value.payee,
    );
    // The 2026-06-18 entries are newest; within that day the one written last in
    // the file (Aliexpress) comes first, then Scalable, then Eschborn; the older
    // Kino is last.
    expect(ordered).toEqual(['Aliexpress', 'Scalable', 'Eschborn', 'Kino']);
  });
});

describe('filterTransactions', () => {
  const tx1: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-12-31',
      payee: 'Costco',
      expenselines: [
        {
          account: 'e:Spending Money',
          dealiasedAccount: 'Expenses:Spending Money',
          amount: 100,
          currency: '$',
          reconcile: '',
        },
        {
          account: 'c:Citi',
          dealiasedAccount: 'Credit:City',
          amount: -100,
          reconcile: '',
        },
      ],
    },
  };
  const tx2: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-12-30',
      payee: "Trader Joe's",
      expenselines: [
        {
          account: 'e:Food:Grocery',
          dealiasedAccount: 'Expenses:Food:Grocery',
          amount: 120,
          currency: '$',
          reconcile: '',
        },
        {
          amount: -120,
          account: 'c:Citi',
          dealiasedAccount: 'Credit:City',
          reconcile: '',
        },
      ],
    },
  };
  const tx3: EnhancedTransaction = {
    type: 'tx',
    blockLine: -1,
    block: emptyBlock,
    value: {
      date: '2021-12-29',
      payee: 'PCC',
      expenselines: [
        {
          account: 'e:Food:Grocery',
          dealiasedAccount: 'Expenses:Food:Grocery',
          amount: 20,
          currency: '$',
          reconcile: '',
        },
        {
          amount: -20,
          account: 'c:Citi',
          dealiasedAccount: 'Credit:City',
          reconcile: '',
        },
      ],
    },
  };
  test('When there are no filters', () => {
    const input = [tx1, tx2, tx3];
    const result = filterTransactions(input);
    expect(result).toEqual(input);
  });

  describe('filterByAccount', () => {
    test('When the account matches', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByAccount('e:Spending Money'),
      );
      expect(result).toEqual([tx1]);
    });
    test('When the no accounts match', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByAccount('e:House:Maintenance'),
      );
      expect(result).toEqual([]);
    });
    test('When there are multiple matches', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByAccount('e:Food:Grocery'),
      );
      expect(result).toEqual([tx2, tx3]);
    });
    test('When filtering by dealiased account name', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByAccount('Expenses:Food:Grocery'),
      );
      expect(result).toEqual([tx2, tx3]);
    });
  });

  describe('filterByPayee', () => {
    test('When the payee matches', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(input, filterByPayeeExact('Costco'));
      expect(result).toEqual([tx1]);
    });
    test('When there are no matches', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByPayeeExact('Home Depot'),
      );
      expect(result).toEqual([]);
    });
  });

  describe('filterBySearch', () => {
    const memoTx: EnhancedTransaction = {
      type: 'tx',
      blockLine: -1,
      block: emptyBlock,
      value: {
        date: '2021-12-28',
        payee: 'Amazon',
        comment: 'birthday present #gifts',
        expenselines: [
          {
            account: 'e:Shopping',
            dealiasedAccount: 'Expenses:Shopping',
            amount: 30,
            currency: '$',
            reconcile: '',
            comment: 'wireless headphones',
          },
          {
            amount: -30,
            account: 'c:Citi',
            dealiasedAccount: 'Credit:City',
            reconcile: '',
          },
        ],
      },
    };

    test('an empty query matches everything', () => {
      const input = [tx1, tx2, memoTx];
      expect(filterTransactions(input, filterBySearch(''))).toEqual(input);
      expect(filterTransactions(input, filterBySearch('   '))).toEqual(input);
    });

    test('matches on the payee, case-insensitively', () => {
      const input = [tx1, tx2, memoTx];
      expect(filterTransactions(input, filterBySearch('costco'))).toEqual([
        tx1,
      ]);
      expect(filterTransactions(input, filterBySearch('joe'))).toEqual([tx2]);
    });

    test('matches on the transaction memo (excluding tags)', () => {
      const input = [tx1, tx2, memoTx];
      expect(filterTransactions(input, filterBySearch('birthday'))).toEqual([
        memoTx,
      ]);
      // The tag text itself is not part of the searchable memo.
      expect(filterTransactions(input, filterBySearch('gifts'))).toEqual([]);
    });

    test('matches on a per-posting memo', () => {
      const input = [tx1, tx2, memoTx];
      expect(filterTransactions(input, filterBySearch('headphones'))).toEqual([
        memoTx,
      ]);
    });
  });

  describe('mutliple filters', () => {
    test('When the payee and account match different transactions', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByPayeeExact('PCC'),
        filterByAccount('e:Spending Money'),
      );
      expect(result).toEqual([tx1, tx3]);
    });
    test('When matching multiple of the same filter', () => {
      const input = [tx1, tx2, tx3];
      const result = filterTransactions(
        input,
        filterByPayeeExact('PCC'),
        filterByPayeeExact("Trader Joe's"),
      );
      expect(result).toEqual([tx2, tx3]);
    });
  });
});

describe('getAccountsForPayee()', () => {
  test('When the payee has not been used before', () => {
    const contents = `2021-01-01 Starbucks
    Expenses:Food:Coffee    $5.00
    Assets:Checking`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Unknown')).toEqual([]);
  });

  test('Returns the accounts in order for a simple transaction', () => {
    const contents = `2021-01-01 Starbucks
    Expenses:Food:Coffee    $5.00
    Assets:Checking`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Starbucks')).toEqual([
      'Expenses:Food:Coffee',
      'Assets:Checking',
    ]);
  });

  test('Returns all accounts when more than two are involved', () => {
    const contents = `2021-03-01 Paycheck
    Assets:Checking    $1000.00
    Income:Salary    $-800.00
    Liabilities:Loan    $-200.00`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Paycheck')).toEqual([
      'Assets:Checking',
      'Income:Salary',
      'Liabilities:Loan',
    ]);
  });

  test('Returns the accounts from the most recent transaction', () => {
    const contents = `2021-01-01 Starbucks
    Expenses:Food:Coffee    $5.00
    Assets:Checking

2021-06-01 Starbucks
    Expenses:Food:Coffee    $4.00
    Liabilities:Visa`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Starbucks')).toEqual([
      'Expenses:Food:Coffee',
      'Liabilities:Visa',
    ]);
  });

  test('Most recent is by date, not file order', () => {
    const contents = `2021-06-01 Starbucks
    Expenses:Food:Coffee    $4.00
    Liabilities:Visa

2021-01-01 Starbucks
    Expenses:Food:Coffee    $5.00
    Assets:Checking`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Starbucks')).toEqual([
      'Expenses:Food:Coffee',
      'Liabilities:Visa',
    ]);
  });

  test('Returns dealiased account names', () => {
    const contents = `alias e=Expenses
alias b=Assets:Banking

2021-02-01 Aliased
    e:Food    $10.00
    b:Main`;
    const txCache = parse(contents, settingsWithDefaults({}));
    expect(txCache.parsingErrors).toEqual([]);
    expect(getAccountsForPayee(txCache.transactions, 'Aliased')).toEqual([
      'Expenses:Food',
      'Assets:Banking:Main',
    ]);
  });
});

describe('tags', () => {
  describe('sanitizeTag()', () => {
    test.each([
      ['coffee', 'coffee'],
      ['#coffee', 'coffee'],
      ['##coffee', 'coffee'],
      ['  #coffee  ', 'coffee'],
      ['#coffee.', 'coffee'],
      ['#work,', 'work'],
      ['multi word tag', 'multi-word-tag'],
      ['#multi word', 'multi-word'],
      ['Urlaub', 'Urlaub'],
      ['#nested/sub', 'nested/sub'],
      ['', ''],
      ['#', ''],
    ])('sanitizeTag(%p) === %p', (input, expected) => {
      expect(sanitizeTag(input)).toEqual(expected);
    });
  });

  describe('getTagsFromComment()', () => {
    test.each<[string | undefined, string[]]>([
      [undefined, []],
      ['', []],
      ['just a memo', []],
      ['#coffee', ['coffee']],
      ['lunch with team #work', ['work']],
      ['#groceries #weekly', ['groceries', 'weekly']],
      ['memo #a more text #b', ['a', 'b']],
      ['# notatag', []],
      ['#coffee.', ['coffee']],
    ])('getTagsFromComment(%p) === %p', (input, expected) => {
      expect(getTagsFromComment(input)).toEqual(expected);
    });
  });

  describe('getMemoFromComment()', () => {
    test.each<[string | undefined, string]>([
      [undefined, ''],
      ['', ''],
      ['#coffee', ''],
      ['lunch with team #work', 'lunch with team'],
      ['memo #a more text #b', 'memo more text'],
      ['just a memo', 'just a memo'],
    ])('getMemoFromComment(%p) === %p', (input, expected) => {
      expect(getMemoFromComment(input)).toEqual(expected);
    });
  });

  describe('formatComment()', () => {
    test('with neither a memo nor tags returns undefined', () => {
      expect(formatComment('', [])).toBeUndefined();
    });
    test('with only a memo', () => {
      expect(formatComment('lunch', [])).toEqual('lunch');
    });
    test('with only a tag', () => {
      expect(formatComment('', ['work'])).toEqual('#work');
    });
    test('with both a memo and a tag', () => {
      expect(formatComment('lunch', ['work'])).toEqual('lunch #work');
    });
    test('round trips with the comment parsers', () => {
      const comment = formatComment('lunch with team', ['work']);
      expect(getMemoFromComment(comment)).toEqual('lunch with team');
      expect(getTagsFromComment(comment)).toEqual(['work']);
    });
  });

  describe('getTransactionTag() and filterByTag()', () => {
    const contents = `2021-01-01 Grocery Store    ; weekly shop #groceries
    Expenses:Food    $40.00
    Assets:Checking

2021-01-02 Cinema    ; #fun
    Expenses:Entertainment    $15.00
    Assets:Checking

2021-01-03 Gas Station
    Expenses:Auto    $30.00
    Assets:Checking`;
    const txCache = parse(contents, settingsWithDefaults({}));

    test('the file has no parsing errors', () => {
      expect(txCache.parsingErrors).toEqual([]);
    });

    test('collects the unique tags in the cache, sorted', () => {
      expect(txCache.tags).toEqual(['fun', 'groceries']);
    });

    test('getTransactionTag returns the tag, or empty when untagged', () => {
      expect(getTransactionTag(txCache.transactions[0])).toEqual('groceries');
      expect(getTransactionTag(txCache.transactions[1])).toEqual('fun');
      expect(getTransactionTag(txCache.transactions[2])).toEqual('');
    });

    test('filterByTag keeps only transactions with the tag', () => {
      const result = filterTransactions(
        txCache.transactions,
        filterByTag('groceries'),
      );
      expect(result).toHaveLength(1);
      expect(result[0].value.payee).toEqual('Grocery Store');
    });

    test('filterByTag returns nothing for an unused tag', () => {
      expect(
        filterTransactions(txCache.transactions, filterByTag('missing')),
      ).toEqual([]);
    });
  });
});
