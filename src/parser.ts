import grammar from '../grammar/ledger';
import { Error, TxError } from './error';
import { ISettings } from './settings';
import {
  dealiasAccount,
  firstDate,
  getTagsFromComment,
} from './transaction-utils';
import { flatMap, sortedUniq } from 'lodash';
import { Moment } from 'moment';
import { Grammar, Parser } from 'nearley';
import { err, ok, Result } from 'neverthrow';

/**
 * TransactionCache contains information from the parsed ledger file. It
 * includes both the raw data that is necessary to reconstruct the ledger file,
 * as well as data structures more useful for interaction.
 */
export interface TransactionCache {
  transactions: EnhancedTransaction[];
  firstDate: Moment;
  payees: string[];

  /**
   * tags contains a sorted, deduplicated list of all tags (hashtag-style labels
   * stored in transaction comments, e.g. `#vacation`) used in the file.
   */
  tags: string[];

  aliases: Map<string, string>;

  /**
   * rawAliases stores the aliases as they come directly from the parser.
   */
  rawAliases: AliasWithBlock[];

  /**
   * rawComments stores the comments as they come directly from the parser.
   */
  rawComments: CommentWithBlock[];

  /**
   * rawAccountDeclarations stores `account` directives as they come directly
   * from the parser.
   */
  rawAccountDeclarations: AccountDeclarationWithBlock[];

  /**
   * parsingErrors contains a list of all errors which occured while parsing the
   * ledger file. If there are any errors, then the results of the transaction
   * cache may not be completely valid due to transactions that could not be
   * parsed. These errors should be displayed to the user so they can be
   * rectified.
   */
  parsingErrors: Error[];

  /**
   * Accounts contains a list of all accounts from the file, dealiased if possible.
   */
  accounts: string[];

  /**
   * expenseAccounts is dealiased and only contains expense accounts.
   */
  expenseAccounts: string[];

  /**
   * assetAccounts is dealiased and only contains asset accounts.
   */
  assetAccounts: string[];

  /**
   * incomeAccounts is dealiased and only contains income accounts.
   */
  incomeAccounts: string[];

  /**
   * liabilityAccounts is dealiased and only contains liability accounts.
   */
  liabilityAccounts: string[];
}

export interface Expenseline {
  account: string;
  amount?: number;
  comment?: string;
  currency?: string;
  reconcile: '' | '*' | '!';
}

export interface EnhancedExpenseLine {
  account: string;
  amount: number;
  comment?: string;
  currency?: string;
  dealiasedAccount: string;
  reconcile: '' | '*' | '!';
}

export interface Commentline {
  comment: string;
}

export interface Transaction {
  type: 'tx';
  blockLine: number;
  value: {
    check?: number;
    comment?: string;
    date: string;
    payee: string;
    expenselines: (Expenseline | Commentline)[];
  };
}

export interface EnhancedTransaction {
  type: 'tx';
  blockLine: number;
  block: FileBlock;
  value: {
    check?: number;
    comment?: string;
    date: string;
    payee: string;
    expenselines: (EnhancedExpenseLine | Commentline)[];
  };
}

export interface Alias {
  type: 'alias';
  blockLine: number;
  value: {
    left: string;
    right: string;
  };
}

export interface Comment {
  type: 'comment';
  blockLine: number;
  value: string;
}

/**
 * AccountDeclaration represents an `account` directive, which declares an
 * account that may be used in transactions.
 * See https://hledger.org/hledger.html#account
 */
export interface AccountDeclaration {
  type: 'accountDecl';
  blockLine: number;
  value: {
    account: string;
    comment?: string;
  };
}

/**
 * OtherDirective represents a directive which is recognized but otherwise
 * ignored by this plugin, e.g. `commodity 1000.00€`.
 */
export interface OtherDirective {
  type: 'directive';
  blockLine: number;
  value: string;
}

export type AliasWithBlock = Alias & { block: FileBlock };
export type CommentWithBlock = Comment & { block: FileBlock };
export type TransactionWithBlock = Transaction & { block: FileBlock };
export type AccountDeclarationWithBlock = AccountDeclaration & {
  block: FileBlock;
};

export interface FileBlock {
  block: string;
  firstLine: number;
  lastLine: number;
}

type Element =
  | Transaction
  | Alias
  | Comment
  | AccountDeclaration
  | OtherDirective;
type ElementWithBlock = Element & { block: FileBlock };

export const parse = (
  fileContents: string,
  settings: ISettings,
): TransactionCache => {
  console.time('ledger-file-parse');

  const blocks = splitIntoBlocks(fileContents);
  const errors: Error[] = [];
  const results: ElementWithBlock[] = blocks
    .map((block): ElementWithBlock[] | undefined => {
      const parser = new Parser(Grammar.fromCompiled(grammar));

      // TODO: Sorting may only make sense if comments are not a top-level
      // element. They need to be tied to an alias (move all aliases to the top
      // of the file) or a transaction (sort by date)

      try {
        const innerresults = parser.feed(block.block).finish();
        if (innerresults.length !== 1) {
          // Returning multiple results means that the results were ambiguous
          errors.push({
            message: 'Ambiguous parsing results for block in ledger file',
            block,
          });
          return undefined;
        }
        const elements: Element[] = innerresults[0];
        return assignLineNumbersToElements(elements, block);
      } catch (error) {
        errors.push({
          message: 'Failed to parse block in ledger file',
          error,
          block,
        });
        return undefined;
      }
    })
    .filter((val): val is ElementWithBlock[] => !!val)
    .flat(1);

  const aliases: AliasWithBlock[] = [];
  const comments: CommentWithBlock[] = [];
  const rawTxs: TransactionWithBlock[] = [];
  const accountDeclarations: AccountDeclarationWithBlock[] = [];
  results.forEach((el) => {
    switch (el.type) {
      case 'alias':
        aliases.push(el);
        break;
      case 'comment':
        comments.push(el);
        break;
      case 'tx':
        rawTxs.push(el);
        break;
      case 'accountDecl':
        accountDeclarations.push(el);
        break;
      case 'directive':
        // Recognized but not used by this plugin.
        break;
    }
  });

  const aliasMap = parseAliases(aliases);

  const txs: EnhancedTransaction[] = rawTxs
    .map((tx): EnhancedTransaction | undefined => {
      let hadError = false;
      fillMissingAmount(tx).mapErr((e) => {
        errors.push(e);
        hadError = true;
      });

      if (hadError) {
        return undefined;
      }

      try {
        const newExpenseLines = tx.value.expenselines.map(
          (line): Commentline | EnhancedExpenseLine => {
            if (!('account' in line)) {
              return line;
            }
            return {
              account: line.account,
              dealiasedAccount: dealiasAccount(line.account, aliasMap),
              comment: line.comment,
              currency: line.currency,
              reconcile: line.reconcile,
              amount: line.amount || 0, // safe due to fillMissingAmount
            };
          },
        );

        return {
          ...tx,
          value: {
            ...tx.value,
            expenselines: newExpenseLines,
          },
        };
      } catch (error) {
        console.log(tx);
        console.error(error);
      }
    })
    .filter((tx): tx is EnhancedTransaction => !!tx);

  const payees = sortedUniq(
    txs
      .map(({ value }) => value.payee)
      .sort((a, b) => (a.toLowerCase() > b.toLowerCase() ? 1 : -1)),
  );
  const tags = sortedUniq(
    flatMap(txs, ({ value }) => getTagsFromComment(value.comment)).sort(
      (a, b) => (a.toLowerCase() > b.toLowerCase() ? 1 : -1),
    ),
  );
  const usedAccounts = flatMap(txs, ({ value }) =>
    value.expenselines.flatMap((line) =>
      'dealiasedAccount' in line ? [line.dealiasedAccount] : [],
    ),
  );
  const declaredAccounts = accountDeclarations.map(({ value }) =>
    dealiasAccount(value.account, aliasMap),
  );
  const accounts = sortedUniq(
    [...usedAccounts, ...declaredAccounts].sort((a, b) =>
      a.toLowerCase() > b.toLowerCase() ? 1 : -1,
    ),
  );

  const getAccountType = makeAccountTypeLookup(
    accountDeclarations,
    aliasMap,
    settings,
  );
  const assetAccounts: string[] = [];
  const expenseAccounts: string[] = [];
  const incomeAccounts: string[] = [];
  const liabilityAccounts: string[] = [];
  accounts.forEach((c) => {
    switch (getAccountType(c)) {
      case 'asset':
        assetAccounts.push(c);
        break;
      case 'expense':
        expenseAccounts.push(c);
        break;
      case 'income':
        incomeAccounts.push(c);
        break;
      case 'liability':
        liabilityAccounts.push(c);
        break;
    }
  });

  const firstTxDate = firstDate(txs);

  console.timeLog('ledger-file-parse');
  console.timeEnd('ledger-file-parse');

  return {
    firstDate: firstTxDate,
    aliases: aliasMap,
    rawAliases: aliases,
    rawComments: comments,
    rawAccountDeclarations: accountDeclarations,
    transactions: txs,
    payees,
    tags,
    accounts,
    parsingErrors: errors,

    assetAccounts,
    expenseAccounts,
    incomeAccounts,
    liabilityAccounts,
  };
};

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'unknown';

const accountTypeFromTagValue = (value: string): AccountType | undefined => {
  switch (value.toLowerCase()) {
    case 'a':
    case 'asset':
    case 'assets':
    case 'c': // Cash is a subtype of Asset
    case 'cash':
      return 'asset';
    case 'l':
    case 'liability':
    case 'liabilities':
      return 'liability';
    case 'e':
    case 'equity':
    case 'v': // Conversion is a subtype of Equity
    case 'conversion':
      return 'equity';
    case 'r':
    case 'revenue':
    case 'revenues':
    case 'income':
      return 'income';
    case 'x':
    case 'expense':
    case 'expenses':
      return 'expense';
    default:
      return undefined;
  }
};

/**
 * parseAccountTypeTag extracts the account type from the comment of an
 * `account` directive, declared with a `type:` tag.
 * See https://hledger.org/hledger.html#declaring-account-types
 */
export const parseAccountTypeTag = (
  comment: string | undefined,
): AccountType | undefined => {
  if (!comment) {
    return undefined;
  }
  const match = /(?:^|[\s,])type:\s*([^,\s]+)/i.exec(comment);
  return match ? accountTypeFromTagValue(match[1]) : undefined;
};

/**
 * makeAccountTypeLookup creates a function which categorizes an account name.
 * Types declared on `account` directives take precedence and are inherited by
 * subaccounts, as in hledger. Accounts without a declared type fall back to
 * matching the account name prefixes from the plugin settings.
 */
export const makeAccountTypeLookup = (
  accountDeclarations: AccountDeclaration[],
  aliases: Map<string, string>,
  settings: ISettings,
): ((account: string) => AccountType) => {
  const declaredTypes = new Map<string, AccountType>();
  accountDeclarations.forEach(({ value }) => {
    const declaredType = parseAccountTypeTag(value.comment);
    if (declaredType) {
      declaredTypes.set(dealiasAccount(value.account, aliases), declaredType);
    }
  });

  return (account: string): AccountType => {
    // Subaccounts inherit the type of the closest declared ancestor.
    let candidate = account;
    while (candidate !== '') {
      const declaredType = declaredTypes.get(candidate);
      if (declaredType) {
        return declaredType;
      }
      const splitAt = candidate.lastIndexOf(':');
      candidate = splitAt === -1 ? '' : candidate.substring(0, splitAt);
    }

    if (account.startsWith(settings.assetAccountsPrefix)) {
      return 'asset';
    } else if (account.startsWith(settings.expenseAccountsPrefix)) {
      return 'expense';
    } else if (account.startsWith(settings.incomeAccountsPrefix)) {
      return 'income';
    } else if (account.startsWith(settings.liabilityAccountsPrefix)) {
      return 'liability';
    }
    return 'unknown';
  };
};

/**
 * splitIntoBlocks takes in the contents of a file and divides it into blocks
 * which can be fed into the parser. Blocks are annotated with their start and
 * finish line numbers.
 */
export const splitIntoBlocks = (fileContents: string): FileBlock[] => {
  const blocks: FileBlock[] = [];
  let currentBlock: FileBlock | null = null;

  fileContents.split('\n').forEach((line, i) => {
    // If there is a blank line, save this block and start a new one
    if (line.trim() === '') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      return;
    }

    if (!currentBlock) {
      currentBlock = {
        block: line,
        firstLine: i,
        lastLine: i,
      };
      return;
    }

    currentBlock.block += '\n' + line;
    currentBlock.lastLine = i;
  });

  if (currentBlock) {
    // Don't forget the last one if we don't end with a new line
    blocks.push(currentBlock);
  }

  return blocks;
};

/**
 * assignLineNumbersToElements modifies the provided elements, assigning their
 * firstLine and lastLine properties based on their relative blockLine property
 * and the absolute firstLine and lastLine property in the provided FileBlock.
 */
const assignLineNumbersToElements = (
  elements: Element[],
  block: FileBlock,
): ElementWithBlock[] => {
  if (elements.length === 1) {
    return [
      {
        ...elements[0],
        block,
      },
    ];
  }

  // Each Element in a block should have a blockLine property which is 1-offset.
  return elements.map((element, i): ElementWithBlock => {
    const firstLine = block.firstLine + element.blockLine - 1;
    const lastLine =
      i === elements.length - 1
        ? block.lastLine // Last element
        : elements[i + 1].blockLine - 2 + block.firstLine;
    return {
      ...element,
      block: {
        firstLine,
        lastLine,
        block: block.block
          .split('\n')
          .slice(
            element.blockLine - 1,
            element.blockLine + (lastLine - firstLine),
          )
          .join('\n'),
      },
    };
  });
};

const parseAliases = (aliases: Alias[]): Map<string, string> => {
  const aliasMap = new Map<string, string>();
  aliases.forEach((el) => {
    aliasMap.set(el.value.left, el.value.right);
  });
  return aliasMap;
};

const getTxTotal = (tx: Transaction): number => {
  const lines = tx.value.expenselines;

  // If the last line has an amount, then the inverse of that is the total
  for (let i = lines.length - 1; i--; i >= 0) {
    const line = lines[i];
    if ('account' in line) {
      // This is the last line which is not a comment-only line
      if (line.amount) {
        return -1 * line.amount;
      }
    }
  }

  // The last line does not have an amount, so the other lines must. We can
  // simply add them all together.
  return lines.reduce(
    (sum, line) => ('amount' in line && line.amount ? line.amount + sum : sum),
    0.0,
  );
};

/**
 * fillMissingAmmount attempts to fill any empty amount fields in the
 * transactions expense lines.  Exported only for unit testing. This should not
 * be used outside of the parser.
 */
export const fillMissingAmount = (
  tx: TransactionWithBlock,
): Result<null, TxError> => {
  const lines = tx.value.expenselines;
  let missingLine: Expenseline | undefined;
  let missingIndex = -1;
  let currency = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!('account' in line)) {
      // No account means this line shouldn't have an amount
      continue;
    }

    // Explicit compare to undefined to avoide accidentally comparing to 0
    if (line.amount === undefined) {
      if (missingLine) {
        return err({
          transaction: tx,
          message:
            'Transaction has multiple expense lines without an amount. At most one is allowed.',
        });
      }
      missingLine = line;
      missingIndex = i;
    } else if (line.currency) {
      currency = line.currency;
    }
  }

  if (!missingLine) {
    return ok(null);
  }

  if (currency) {
    missingLine.currency = currency;
  }
  missingLine.amount =
    -1 *
    lines.reduce((prev, line, i): number => {
      if (i === missingIndex || !('account' in line)) {
        return prev;
      }

      return line.amount !== undefined ? prev + line.amount : prev;
    }, 0);

  return ok(null);
};
