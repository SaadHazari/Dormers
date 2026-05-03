import { Check } from 'lucide-react'

// ─── shared UI primitives ─────────────────────────────────────────────────────

export const SelectCard = ({
    selected, onClick, emoji, label, desc,
}: { selected: boolean; onClick: () => void; emoji: string; label: string; desc?: string }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border text-left transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.06]'
                : 'border-[#1e3448] bg-[#0d2035] hover:border-[#2a4a68] hover:bg-[#0f2540]'
        }`}
    >
        <span className="text-xl shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
            <p className={`font-semibold text-[14px] ${selected ? 'text-white' : 'text-white/80'}`}>{label}</p>
            {desc && <p className="text-white/40 text-[12px] mt-0.5 leading-snug">{desc}</p>}
        </div>
        {selected && <Check size={15} className="text-[#f57f20] shrink-0" strokeWidth={2.5} />}
    </button>
)

export const PillCard = ({
    selected, onClick, label,
}: { selected: boolean; onClick: () => void; label: string }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.07] text-white'
                : 'border-[#1e3448] bg-[#0d2035] text-white/55 hover:border-[#2a4a68] hover:text-white/80'
        }`}
    >
        {selected && <Check size={12} className="text-[#f57f20] shrink-0" strokeWidth={3} />}
        <span className="text-[13px] font-semibold">{label}</span>
    </button>
)

export const CtaButton = ({
    children, onClick, disabled = false, type = 'button',
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_4px_28px_rgba(245,127,32,0.4)]"
    >
        {children}
    </button>
)

export const FieldInput = ({
    label, ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
        <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            {label}
        </label>
        <input
            {...props}
            className={`w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 text-white text-[14px] placeholder-white/20 outline-none transition-all ${props.className ?? ''}`}
        />
    </div>
)
