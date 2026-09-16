/**
 * A small RFC 4180 CSV reader.
 *
 * Deliberately not a dependency: the contact book needs to read one kind of
 * file on one screen, and the awkward parts of a real export — a quoted
 * "Surname, Firstname", a doubled quote, a CRLF from Windows, Excel's BOM —
 * are a few lines each. A parser we own is also a parser we can test against
 * the exact files Zoho actually produces.
 *
 * Quoted cells are returned verbatim (whitespace and newlines intact, doubled
 * quotes unescaped). Unquoted cells are trimmed, because a human-edited export
 * is full of ", " padding that nobody means.
 */
export function parseCsv(text: string): string[][] {
    // Excel stamps a BOM on UTF-8 exports; left in place it becomes part of
    // the first header name and every column mapping silently misses.
    const src = text.replace(/^﻿/, '')

    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    let cellWasQuoted = false

    const endCell = () => {
        row.push(cellWasQuoted ? cell : cell.trim())
        cell = ''
        cellWasQuoted = false
    }
    const endRow = () => {
        endCell()
        // A trailing newline would otherwise emit a row of one empty cell.
        if (row.some(c => c !== '')) rows.push(row)
        row = []
    }

    for (let i = 0; i < src.length; i++) {
        const ch = src[i]

        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++ } // escaped quote
                else quoted = false
            } else {
                cell += ch
            }
            continue
        }

        if (ch === '"') { quoted = true; cellWasQuoted = true; continue }
        if (ch === ',') { endCell(); continue }
        if (ch === '\r') continue                      // CRLF: the \n does the work
        if (ch === '\n') { endRow(); continue }
        cell += ch
    }

    // Whatever the file ended on, without requiring a trailing newline.
    if (cell !== '' || row.length > 0) endRow()

    return rows
}
