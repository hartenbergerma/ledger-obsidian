# Ledger for Obsidian

Personal finance tracking and planning, from the comfort of Obsidian! All of
your data is stored in plain text, and interoperable with any tool which
supports the [Ledger CLI](https://www.ledger-cli.org). Stop giving away your
personal financial information to online sites that sell your data. Store it
safely in your Obsidian Vault instead.

## Features

- [x] Widget to quickly input expenses.
  - Use it with Obsidian Mobile to track expenses as they occur on the go!
- [x] Auto suggest previous accounts and expenses to speed entry.
  - Accounts declared with [`account` directives](https://hledger.org/hledger.html#account)
    are suggested as well, and `type:` tags (e.g. `account Cash ; type: A`)
    are used to categorize accounts for the expense, income, and transfer forms.
  - Liability accounts are also suggested in the expense and income fields, and
    additional "Add Split" lines suggest every account so you can enter more
    complex transactions.
  - Selecting a payee that has been used before automatically fills in the
    account fields based on the most recently used accounts for that payee.
- [x] Obsidian Protocol handling to quickly launch Obsidian and immediately record a transaction
  - Create a Shortcut on mobile to `obsidian://ledger`
- [x] Dashboard with net-worth and account visualizations, on desktop and mobile.
- [x] Tag transactions to categorize them across accounts.
  - Add a tag with the "Tag" button in the "Add to Ledger" form. It opens a
    dropdown of the tags already in your file and lets you create a new one.
  - Tags are stored as a `#tag` inside the transaction's comment (e.g.
    `2021/12/25 Starbucks  ; morning coffee #treats`), so they remain compatible
    with any memo text and with the Ledger CLI.
  - Tagged transactions display their tag next to the payee in the transaction
    list, and you can filter the list down to a single tag.
- [x] Recurring transactions to track regular bills, subscriptions, and income.
  - Turn any transaction into a recurring one with the recurring (↻) button in
    the "Add to Ledger" form, next to the "Tag" button. Choose to repeat every
    _N_ weeks (on a weekday) or months (on a day of the month).
  - Optionally move the evaluation date onto the next working day when it lands
    on a weekend or public holiday. Select your country under the plugin
    settings ("Holiday Country") to control which holidays are observed.
  - Recurring transactions are listed in their own "Recurring" section below the
    transaction list, sorted by their next evaluation date. When one is due you
    can add it to your ledger with a single click (with a confirmation), skip a
    single occurrence, edit the schedule, or delete it.
  - Transactions created from a recurring schedule are marked with the recurring
    (↻) icon next to the payee in the transaction list.
  - Schedules are stored in your ledger file using Ledger's periodic-transaction
    (`~`) syntax in a managed region above your transactions, so they remain
    readable and compatible with the Ledger CLI.
- [ ] Reporting (In progress!)
- [ ] Account reconciliation (planned soon!)

![Demo](https://raw.githubusercontent.com/tgrosinger/ledger-obsidian/main/resources/screenshots/demo.gif)

## More Info

For more information about Ledger, see the following resources:

- <https://www.ledger-cli.org>
- <https://plaintextaccounting.org>

## Available Commands

You can run these commands from the Obsidian Command Palette to quickly access
features of the Ledger plugin.

`Add to Ledger`

Open a window to input details for a new transaction. The details will be stored
to your default Ledger file configured in the settings.

`Open Ledger dashboard`

Switch your current window to the Ledger Dashboard. The dashboard will show you
transactions for the default zledger file configured in the settings.
Alternatively, you can also click on any `.ledger` file in the File Explorer to
view that file in the dashboard.

`Reset Ledger Tutorial progress`

Want to see the tutorial again? This will reset your progress so the tutorial
will be shown again the next time you open the dashboard.

## Screenshots

![Ledger Dashboard](https://raw.githubusercontent.com/tgrosinger/ledger-obsidian/main/resources/screenshots/ledger-dashboard.png)

![Add Transaction to Ledger](https://raw.githubusercontent.com/tgrosinger/ledger-obsidian/main/resources/screenshots/add-to-ledger.png)

![Add Transaction to Ledger from mobile](https://raw.githubusercontent.com/tgrosinger/ledger-obsidian/main/resources/screenshots/mobile-add-expense.png)

## Pricing

This plugin is currently provided for free, however will possibly become a paid
plugin once feature complete. If you would like to say thanks or help support
continued development, feel free to send a little my way through one of the
following methods:

[![GitHub Sponsors](https://img.shields.io/github/sponsors/tgrosinger?style=social)](https://github.com/sponsors/tgrosinger)
[![Paypal](https://img.shields.io/badge/paypal-tgrosinger-yellow?style=social&logo=paypal)](https://paypal.me/tgrosinger)
[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/tgrosinger)
