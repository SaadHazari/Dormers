'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Download, Lock, LockOpen, Sparkles, Wand2 } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import {
    isRecipeV2,
    scaleIngredient,
    alternativeAmounts,
    formatAmount,
    getRecipeComponents,
    type AnyRecipe,
    type RecipeV2,
    type IngredientUnit,
    type StructuredIngredient,
} from '@/contexts/ops/domain/recipe-format'
import { approveRecipeDraft, discardRecipeDraft, setRecipeLocked } from './actions'

type Row = Record<string, unknown>
type Result = { ok: boolean; message: string }

/**
 * Recipe block inside the dish editor: AI generate / convert, draft review
 * with new-ingredient flags, approve/discard, and the proprietary lock.
 * Drafts live in dishes.recipe_draft — the kitchen only reads approved
 * dishes.recipe, so nothing here can leak an unreviewed recipe to the cooks.
 */
export function RecipeStudio({ dish, onResult }: {
    dish: Row
    onResult: (r: Result) => void
}) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [generating, setGenerating] = useState<'generate' | 'convert' | null>(null)
    const [showCurrent, setShowCurrent] = useState(false)

    const recipe = (dish.recipe ?? null) as AnyRecipe | null
    const draft = (dish.recipe_draft ?? null) as RecipeV2 | null
    const locked = Boolean(dish.recipe_locked)
    const isStructured = isRecipeV2(recipe)

    async function runAi(mode: 'generate' | 'convert') {
        setGenerating(mode)
        try {
            const res = await fetch('/api/admin/recipes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dishId: dish.id as string, mode }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                onResult({ ok: false, message: (json as { error?: string }).error ?? 'Recipe generation failed.' })
                return
            }
            onResult({ ok: true, message: 'Draft ready — review it below, then approve.' })
            router.refresh()
        } catch {
            onResult({ ok: false, message: 'Could not reach the recipe generator. Check your connection and try again.' })
        } finally {
            setGenerating(null)
        }
    }

    function handleApprove() {
        startTransition(async () => {
            const res = await approveRecipeDraft(dish.id as string)
            onResult(res)
            if (res.ok) router.refresh()
        })
    }

    function handleDiscard() {
        startTransition(async () => {
            const res = await discardRecipeDraft(dish.id as string)
            onResult(res)
            if (res.ok) router.refresh()
        })
    }

    function handleLockToggle() {
        startTransition(async () => {
            const res = await setRecipeLocked(dish.id as string, !locked)
            onResult(res)
            if (res.ok) router.refresh()
        })
    }

    const statusChip = draft
        ? { text: 'Draft awaiting review', cls: `${t.accentBg} ${t.accent}` }
        : isStructured
            ? { text: 'Recipe live (structured)', cls: `${t.successBg} ${t.success}` }
            : recipe
                ? { text: 'Recipe live (old format)', cls: `${t.warningBg} ${t.warning}` }
                : { text: 'No recipe yet', cls: `${t.border} ${t.faint} border` }

    const newIngredients = draft?.meta?.newIngredients ?? []

    return (
        <div className={`mt-5 pt-5 border-t ${t.border}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`text-[11px] font-bold tracking-[0.08em] uppercase ${t.faint}`}>Recipe</span>
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black tracking-[0.08em] uppercase ${statusChip.cls}`}>
                        {statusChip.text}
                    </span>
                    <button
                        type="button"
                        onClick={handleLockToggle}
                        disabled={isPending}
                        title={locked ? 'Unlock — allow AI regeneration' : 'Lock as proprietary — AI will refuse to regenerate'}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors duration-150 ${t.border} ${locked ? t.accent : t.faint} ${t.cardHover}`}
                    >
                        {locked ? <Lock size={13} strokeWidth={2.2} /> : <LockOpen size={13} strokeWidth={2.2} />}
                    </button>
                </div>
            </div>

            {locked && (
                <p className={`text-[12px] font-medium mb-3 ${t.muted}`}>
                    Proprietary recipe. The AI generator will not replace it. You can still convert the format.
                </p>
            )}

            {/* Actions (hidden while a draft is pending review) */}
            {!draft && (
                <div className="flex flex-wrap items-center gap-2">
                    {!locked && (
                        <AdminButton
                            type="button"
                            loading={generating === 'generate'}
                            disabled={generating !== null}
                            icon={<Sparkles size={13} strokeWidth={2.2} />}
                            onClick={() => runAi('generate')}
                        >
                            {recipe ? 'Regenerate with AI' : 'Generate with AI'}
                        </AdminButton>
                    )}
                    {recipe && !isStructured && (
                        <AdminButton
                            type="button"
                            variant="ghost"
                            loading={generating === 'convert'}
                            disabled={generating !== null}
                            icon={<Wand2 size={13} strokeWidth={2.2} />}
                            onClick={() => runAi('convert')}
                        >
                            Convert to structured
                        </AdminButton>
                    )}
                    {recipe && (
                        <a
                            href={`/api/admin/recipes/pdf?dishId=${dish.id as string}&disposition=inline`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold tracking-[0.04em] uppercase border transition-colors duration-150 ${t.border} ${t.body} ${t.cardHover}`}
                        >
                            <Download size={13} strokeWidth={2.2} />
                            PDF
                        </a>
                    )}
                </div>
            )}
            {generating !== null && (
                <p className={`text-[12px] font-medium mt-2 ${t.muted}`}>
                    {generating === 'generate' ? 'Cooking up a recipe from your pantry, takes about 20 seconds.' : 'Converting the recipe format, takes about 20 seconds.'}
                </p>
            )}

            {/* Draft review */}
            {draft && (
                <div className={`rounded-xl border ${t.borderStrong} overflow-hidden`}>
                    <div className={`px-4 py-2.5 border-b ${t.border} flex items-center justify-between gap-2`}>
                        <span className={`text-[11px] font-bold ${t.muted}`}>
                            {draft.meta?.source === 'converted' ? 'Converted from the old format, nothing rewritten' : 'AI generated from your pantry'}
                        </span>
                        <div className="flex items-center gap-2">
                            <a
                                href={`/api/admin/recipes/pdf?dishId=${dish.id as string}&draft=1&disposition=inline`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Preview this draft as a PDF"
                                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors duration-150 ${t.border} ${t.muted} ${t.cardHover}`}
                            >
                                <Download size={13} strokeWidth={2.2} />
                            </a>
                            <AdminButton type="button" variant="ghost" onClick={handleDiscard} loading={isPending}>
                                Discard
                            </AdminButton>
                            <AdminButton type="button" onClick={handleApprove} loading={isPending}>
                                Approve
                            </AdminButton>
                        </div>
                    </div>

                    {newIngredients.length > 0 && (
                        <div className={`mx-4 mt-3 px-3 py-2.5 rounded-lg border ${t.warningBg}`}>
                            <span className={`text-[12px] font-bold ${t.warning}`}>
                                Adds {newIngredients.length} ingredient{newIngredients.length === 1 ? '' : 's'} not in your pantry:{' '}
                                {newIngredients.join(', ')}
                            </span>
                        </div>
                    )}

                    <div className="max-h-[320px] overflow-y-auto px-4 py-3">
                        <RecipePreview recipe={draft} dishName={dish.name as string} />
                    </div>
                </div>
            )}

            {/* Current live recipe (collapsed) */}
            {!draft && recipe && (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setShowCurrent(v => !v)}
                        className={`inline-flex items-center gap-1 text-[12px] font-bold ${t.muted}`}
                    >
                        {showCurrent ? <ChevronUp size={13} strokeWidth={2.2} /> : <ChevronDown size={13} strokeWidth={2.2} />}
                        {showCurrent ? 'Hide current recipe' : 'View current recipe'}
                    </button>
                    {showCurrent && (
                        <div className={`mt-2 rounded-xl border ${t.border} max-h-[320px] overflow-y-auto px-4 py-3`}>
                            <RecipePreview recipe={recipe} dishName={dish.name as string} />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/** Tappable amount — cycles through unit alternatives (view only). */
function AdminAmountChip({ qty, unit }: { qty: number; unit: IngredientUnit }) {
    const options = alternativeAmounts(qty, unit)
    const [idx, setIdx] = useState(0)
    if (options.length === 0) return null
    const opt = options[Math.min(idx, options.length - 1)]
    const canCycle = options.length > 1
    return (
        <button
            type="button"
            onClick={() => canCycle && setIdx((idx + 1) % options.length)}
            title={canCycle ? 'Tap to change unit' : undefined}
            className={`font-bold ${canCycle ? 'border-b border-dotted border-current cursor-pointer' : 'cursor-default'}`}
        >
            {opt.approx ? '≈' : ''}{formatAmount(opt.qty, opt.unit)}{' '}
        </button>
    )
}

type PreviewComponent = { title: string; sections: { heading: string; items: unknown[] }[]; method: string[] }

/** Read-only recipe body — renders explicit components (structured v2) or a
 *  single legacy block (v1 string lines). */
function RecipePreview({ recipe, dishName }: { recipe: AnyRecipe; dishName: string }) {
    const { t } = useAdminTheme()
    const structured = isRecipeV2(recipe)
    const components: PreviewComponent[] = structured
        ? (getRecipeComponents(recipe as RecipeV2, dishName) as PreviewComponent[])
        : [{ title: '', sections: ((recipe.sections ?? []) as PreviewComponent['sections']), method: recipe.method ?? [] }]

    return (
        <div className="space-y-5">
            {components.map((comp, ci) => (
                <div key={ci}>
                    {comp.title && (
                        <div className={`text-[12px] font-black tracking-[0.04em] uppercase mb-2 pb-1 border-b ${t.border} ${t.accent}`}>
                            {comp.title}
                        </div>
                    )}
                    {comp.sections.map((section, si) => (
                        <div key={si} className="mb-2">
                            {comp.sections.length > 1 && (
                                <div className={`text-[11px] font-bold tracking-[0.06em] uppercase mb-1 ${t.faint}`}>{section.heading}</div>
                            )}
                            <ul className="space-y-1">
                                {structured
                                    ? (section.items as StructuredIngredient[]).map((ing, ii) => {
                                        const d = scaleIngredient(ing, 1)
                                        return (
                                            <li key={ii} className={`text-[13px] font-medium leading-[1.5] ${t.body}`}>
                                                {d.amount && ing.qty !== null && ing.unit !== null
                                                    ? <AdminAmountChip qty={ing.qty} unit={ing.unit} />
                                                    : null}
                                                {d.label}
                                                {d.note && <span className={t.muted}> — {d.note}</span>}
                                                {ing.pantry === false && (
                                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black tracking-[0.06em] uppercase border ${t.warningBg} ${t.warning}`}>
                                                        new
                                                    </span>
                                                )}
                                            </li>
                                        )
                                    })
                                    : (section.items as string[]).map((line, ii) => (
                                        <li key={ii} className={`text-[13px] font-medium leading-[1.5] ${t.body}`}>{line}</li>
                                    ))}
                            </ul>
                        </div>
                    ))}
                    {comp.method.length > 0 && (
                        <ol className="space-y-1 list-decimal pl-5 mt-1">
                            {comp.method.map((step, i) => (
                                <li key={i} className={`text-[13px] font-medium leading-[1.5] ${t.body}`}>{step}</li>
                            ))}
                        </ol>
                    )}
                </div>
            ))}
            {recipe.notes && (
                <p className={`text-[12px] font-medium leading-[1.5] ${t.muted}`}>{recipe.notes}</p>
            )}
        </div>
    )
}
