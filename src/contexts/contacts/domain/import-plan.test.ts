import { describe, it, expect } from 'vitest'
import {
    normaliseEmail, normalisePhoneE164, normaliseName,
    guessColumnMapping, planImport,
    type ExistingContact, type RawRow,
} from './import-plan'

describe('normaliseEmail', () => {
    it('lowercases and trims, because that is the identity key', () => {
        expect(normaliseEmail('  Saad.Hazari@Example.COM ')).toBe('saad.hazari@example.com')
    })

    it('rejects anything that is not one plausible address', () => {
        for (const bad of ['', '   ', 'not an email', 'a@b', '@example.com', 'a@@b.com',
                           'a@b.com, c@d.com', 'a b@example.com']) {
            expect(normaliseEmail(bad)).toBeNull()
        }
    })

    it('accepts the shapes a real export contains', () => {
        expect(normaliseEmail('s+tag@sub.example.co.uk')).toBe('s+tag@sub.example.co.uk')
        expect(normaliseEmail("o'brien@example.com")).toBe("o'brien@example.com")
    })
})

describe('normalisePhoneE164', () => {
    it('reads the UAE shapes a student actually types', () => {
        expect(normalisePhoneE164('0504619384')).toBe('+971504619384')
        expect(normalisePhoneE164('+971 50 461 9384')).toBe('+971504619384')
        expect(normalisePhoneE164('971-50-461-9384')).toBe('+971504619384')
    })

    it('keeps a foreign number rather than forcing it to UAE', () => {
        expect(normalisePhoneE164('+966552426072')).toBe('+966552426072')
    })

    it('reads the 00 international prefix', () => {
        expect(normalisePhoneE164('00971504619384')).toBe('+971504619384')
    })

    it('refuses anything too short or too long to be a number', () => {
        for (const bad of ['', '  ', '12345', 'n/a', '-', '+', '1234567890123456789']) {
            expect(normalisePhoneE164(bad)).toBeNull()
        }
    })
})

describe('normaliseName', () => {
    it('collapses the whitespace a spreadsheet leaves behind', () => {
        expect(normaliseName('  Saad   Hazari ')).toBe('Saad Hazari')
    })

    it('flips "Surname, Firstname" into reading order', () => {
        expect(normaliseName('Hazari, Saad')).toBe('Saad Hazari')
    })

    it('leaves a name with no comma alone', () => {
        expect(normaliseName('Saad Hazari')).toBe('Saad Hazari')
    })

    it('returns null rather than an empty string', () => {
        expect(normaliseName('   ')).toBeNull()
        expect(normaliseName(undefined)).toBeNull()
    })
})

describe('guessColumnMapping', () => {
    it('finds the obvious headers so a clean export needs no mapping', () => {
        expect(guessColumnMapping(['Display Name', 'EmailID', 'Phone']))
            .toEqual({ name: 0, email: 1, phone: 2 })
    })

    it('prefers a mobile column over a landline one', () => {
        const m = guessColumnMapping(['Name', 'Email', 'Phone', 'Mobile'])
        expect(m.phone).toBe(3)
    })

    it('leaves a column unmapped rather than guessing wrong', () => {
        expect(guessColumnMapping(['col1', 'col2'])).toEqual({ name: null, email: null, phone: null })
    })
})

describe('planImport', () => {
    const existing: ExistingContact[] = [
        { email: 'known@example.com', phone_e164: '+971500000001', isCustomer: false },
        { email: 'buyer@example.com', phone_e164: '+971500000002', isCustomer: true },
        // Two people share this number. It identifies nobody on its own.
        { email: 'flat.a@example.com', phone_e164: '+971545766707', isCustomer: true },
        { email: 'flat.b@example.com', phone_e164: '+971545766707', isCustomer: false },
        { email: null, phone_e164: '+971509999999', isCustomer: false },
    ]

    const plan = (rows: RawRow[]) => planImport(rows, existing)

    it('calls a genuinely new person new', () => {
        const [r] = plan([{ rowNumber: 2, name: 'New Person', email: 'fresh@example.com', phone: '0501112222' }])
        expect(r.bucket).toBe('new')
        expect(r.email).toBe('fresh@example.com')
        expect(r.phone).toBe('+971501112222')
    })

    it('recognises someone already in the book, and separately someone who bought', () => {
        const [a, b] = plan([
            { rowNumber: 2, email: 'KNOWN@example.com' },
            { rowNumber: 3, email: 'buyer@example.com' },
        ])
        expect(a.bucket).toBe('existing_contact')
        expect(b.bucket).toBe('existing_customer')
    })

    it('matches on phone only when the row has no email of its own', () => {
        // Same phone as a known contact, but a different address: two people,
        // one shared handset. Matching here would merge strangers.
        const [withEmail] = plan([{ rowNumber: 2, email: 'someone.else@example.com', phone: '+971500000001' }])
        expect(withEmail.bucket).toBe('new')

        const [phoneOnly] = plan([{ rowNumber: 2, phone: '+971509999999' }])
        expect(phoneOnly.bucket).toBe('existing_contact')
    })

    it('will not match a phone-only row against a number two people share', () => {
        const [r] = plan([{ rowNumber: 2, phone: '+971545766707' }])
        expect(r.bucket).toBe('new')
    })

    it('catches a repeat inside the same file, keeping the first occurrence', () => {
        const rows = plan([
            { rowNumber: 2, email: 'twice@example.com', name: 'First' },
            { rowNumber: 3, email: 'TWICE@example.com', name: 'Second' },
        ])
        expect(rows.map(r => r.bucket)).toEqual(['new', 'duplicate_in_file'])
    })

    it('treats two phone-only rows sharing a number as a repeat', () => {
        const rows = plan([
            { rowNumber: 2, phone: '0501234567' },
            { rowNumber: 3, phone: '+971501234567' },
        ])
        expect(rows.map(r => r.bucket)).toEqual(['new', 'duplicate_in_file'])
    })

    it('rejects a row we could never reach, and says why', () => {
        const [noWay, badBoth] = plan([
            { rowNumber: 2, name: 'Nameless' },
            { rowNumber: 3, name: 'Bad', email: 'not-an-email', phone: 'n/a' },
        ])
        expect(noWay.bucket).toBe('invalid')
        expect(noWay.reason).toMatch(/no email or phone/i)
        expect(badBoth.bucket).toBe('invalid')
    })

    it('keeps a row whose email is junk but whose phone is good', () => {
        const [r] = plan([{ rowNumber: 2, email: 'n/a', phone: '0501234567' }])
        expect(r.bucket).toBe('new')
        expect(r.email).toBeNull()
        expect(r.phone).toBe('+971501234567')
    })

    it('reports the row number from the file so a person can go and look', () => {
        const [r] = plan([{ rowNumber: 47, email: 'x@example.com' }])
        expect(r.rowNumber).toBe(47)
    })

    it('counts only new rows as things a commit would write', () => {
        const rows = plan([
            { rowNumber: 2, email: 'fresh1@example.com' },
            { rowNumber: 3, email: 'fresh2@example.com' },
            { rowNumber: 4, email: 'known@example.com' },
            { rowNumber: 5, email: 'buyer@example.com' },
            { rowNumber: 6, email: 'fresh1@example.com' },
            { rowNumber: 7, name: 'nobody' },
        ])
        const tally = (b: string) => rows.filter(r => r.bucket === b).length
        expect(tally('new')).toBe(2)
        expect(tally('existing_contact')).toBe(1)
        expect(tally('existing_customer')).toBe(1)
        expect(tally('duplicate_in_file')).toBe(1)
        expect(tally('invalid')).toBe(1)
    })
})
