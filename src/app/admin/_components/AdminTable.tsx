'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useAdminTheme } from './AdminThemeProvider'

export interface Column<T> {
    key: string
    label: string
    sortable?: boolean
    align?: 'left' | 'right' | 'center'
    width?: string
    render: (row: T, index: number) => React.ReactNode
    renderMobile?: (row: T, index: number) => React.ReactNode
}

interface Props<T> {
    columns: Column<T>[]
    data: T[]
    rowKey: (row: T) => string
    onSort?: (key: string, dir: 'asc' | 'desc') => void
    onRowClick?: (row: T) => void
    emptyMessage?: string
    className?: string
}

export function AdminTable<T>({
    columns,
    data,
    rowKey,
    onSort,
    onRowClick,
    emptyMessage = 'No data',
    className = '',
}: Props<T>) {
    const { t } = useAdminTheme()
    const [sortKey, setSortKey] = useState<string | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    function handleSort(key: string) {
        const newDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'
        setSortKey(key)
        setSortDir(newDir)
        onSort?.(key, newDir)
    }

    if (data.length === 0) {
        return (
            <div className={`text-center py-12 text-sm font-semibold ${t.muted}`}>
                {emptyMessage}
            </div>
        )
    }

    return (
        <>
            {/* Desktop table */}
            <div className={`hidden md:block overflow-x-auto ${className}`}>
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className={t.tableHeader}>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    style={{ width: col.width }}
                                    className={`px-3 py-2.5 font-bold tracking-[0.06em] uppercase text-[10px] ${
                                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                    } ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.label}
                                        {col.sortable && sortKey === col.key && (
                                            sortDir === 'asc'
                                                ? <ChevronUp size={12} strokeWidth={2.5} />
                                                : <ChevronDown size={12} strokeWidth={2.5} />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr
                                key={rowKey(row)}
                                className={`${t.tableRow} ${onRowClick ? 'cursor-pointer' : ''} transition-colors duration-100`}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                            >
                                {columns.map(col => (
                                    <td
                                        key={col.key}
                                        className={`px-3 py-2.5 ${
                                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                        }`}
                                    >
                                        {col.render(row, i)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile card view */}
            <div className={`md:hidden flex flex-col gap-3 ${className}`}>
                {data.map((row, i) => (
                    <div
                        key={rowKey(row)}
                        className={`${t.card} rounded-xl p-3.5 ${onRowClick ? 'cursor-pointer active:scale-[0.99]' : ''} transition-all duration-100`}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        role={onRowClick ? 'button' : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                        onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row) } : undefined}
                    >
                        {columns.map(col => {
                            const content = col.renderMobile
                                ? col.renderMobile(row, i)
                                : col.render(row, i)
                            if (content === null || content === undefined) return null
                            return (
                                <div key={col.key} className="flex items-baseline justify-between gap-2 py-1 first:pt-0 last:pb-0">
                                    <span className={`text-[10px] font-bold tracking-[0.10em] uppercase shrink-0 ${t.muted}`}>
                                        {col.label}
                                    </span>
                                    <span className="text-[13px] text-right">{content}</span>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </>
    )
}
