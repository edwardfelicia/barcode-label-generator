# Barcode Label Generator

Print-ready UPC-A barcode labels from product name, SKU, and UPC. Single or batch, PNG or sheet PDF. Runs entirely in the browser: nothing is uploaded and nothing is stored on a server.

**Live:** https://edwardfelicia.github.io/barcode-label-generator/

## What it does

- **UPC-A** with automatic check digit. Enter 11 digits and the 12th is calculated, enter 12 and it is verified. Non-numeric codes fall back to Code 128.
- **Product labels**, single or batch, as PNG, ZIP, or a print-ready sheet PDF (Avery 5160 / 8160 by default, 30 per Letter sheet).
- **Case and carton labels**, single or batch, with packaging quantities and a sheet PDF (Avery 5163 / 8163 by default, 10 per Letter sheet).
- **Colour block format**, splitting a product name into a base name plus a variant name set in a coloured panel beside the barcode.
- **Batch paste** from a spreadsheet. Columns in any order, tab or comma separated, with SKU and UPC conflict warnings.
- **Partial sheets.** Set copies of each label and a starting label number to finish a half-used sheet.
- **Custom sheet layouts.** Label size, columns, rows, margins, gaps, safe margin, and cut outlines.

## Use it

Open `index.html` in a browser, or host the three files anywhere static. There is no build step and no install.

## Configure it for your own catalogue

Everything catalogue-specific lives at the top of the relevant block in `app.js`:

| Constant | What it controls |
| --- | --- |
| `DISPLAY_FONT` | Font used on the rendered labels |
| `SKU_PREFIXES` | Your SKU prefixes. Leave empty to match any letters-plus-digits token |
| `SOURCE_TABS` | Category names from your own spreadsheet, used to auto-pick packaging |
| `PACKS` | Packaging types with units per case and cases per carton |
| `TAB_PACK` | Maps a category to a packaging type |
| `NAME_RULES` | Product name patterns that pick a packaging type directly |

## Printing

Print at Actual size (100%) with Fit to page turned off. Scaling shifts each row slightly more than the one above it. The safe margin keeps text and digits clear of label edges if the printer drifts.

## Background

Built from a tool I wrote for an e-commerce manufacturer, where labels had been assembled by hand in Google Docs. This version is rebuilt generic, with no client data, and split into separate HTML, CSS, and JS.
