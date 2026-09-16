import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
    it('reads a plain file into rows of cells', () => {
        expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    })

    it('keeps a comma that lives inside quotes', () => {
        // Zoho writes "Surname, Firstname" into a single display-name column.
        expect(parseCsv('name,email\n"Hazari, Saad",s@x.com'))
            .toEqual([['name', 'email'], ['Hazari, Saad', 's@x.com']])
    })

    it('unescapes a doubled quote', () => {
        expect(parseCsv('note\n"she said ""hi"""')).toEqual([['note'], ['she said "hi"']])
    })

    it('keeps a newline that lives inside quotes', () => {
        expect(parseCsv('note,email\n"line one\nline two",s@x.com'))
            .toEqual([['note', 'email'], ['line one\nline two', 's@x.com']])
    })

    it('handles CRLF line endings, which is what a Windows export gives', () => {
        expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
    })

    it('keeps empty cells rather than collapsing the row', () => {
        expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']])
    })

    it('drops a trailing blank line instead of emitting an empty row', () => {
        expect(parseCsv('a,b\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
    })

    it('strips a UTF-8 BOM, which Excel puts on every export', () => {
        expect(parseCsv('﻿name,email\nSaad,s@x.com')[0]).toEqual(['name', 'email'])
    })

    it('returns nothing for an empty file', () => {
        expect(parseCsv('')).toEqual([])
        expect(parseCsv('   \n  ')).toEqual([])
    })

    it('trims surrounding whitespace on unquoted cells but not inside quotes', () => {
        expect(parseCsv('a, b ,c\n1, 2 ,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
        expect(parseCsv('a\n" padded "')).toEqual([['a'], [' padded ']])
    })
})
