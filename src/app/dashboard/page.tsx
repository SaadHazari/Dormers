import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'
import Image from 'next/image'
import Link from 'next/link'
import { signout } from '@/app/login/actions'
import { Suspense } from 'react'

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    // Customer profile
    const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', user.id)
        .single()

    // Most recent active or paused subscription
    const { data: activeSubscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('customer_id', user.id)
        .in('status', ['Active', 'Paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    // Full history (for past plans & renew flow)
    const { data: allSubscriptions } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

    return (
        <div className="min-h-screen bg-[#091825] flex flex-col">
            <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center z-50">
                <Link href="/">
                    <Image
                        src="/logo-light.svg"
                        alt="Dormers"
                        width={120}
                        height={36}
                        className="w-auto h-8 hover:opacity-80 transition-opacity"
                        priority
                    />
                </Link>
                <form action={signout}>
                    <button className="text-white/50 hover:text-white text-sm font-semibold transition-colors">
                        Sign Out
                    </button>
                </form>
            </header>

            <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 pb-12">
                <div className="mb-8">
                    <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                        Your Dashboard
                    </h2>
                    <p className="text-white/40 text-sm mt-1">
                        {customer?.name ? `Welcome back, ${customer.name.split(' ')[0]}.` : 'Manage your meal plan and deliveries.'}
                    </p>
                </div>

                <Suspense fallback={
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 rounded-full border-2 border-[#f57f20]/30 border-t-[#f57f20] animate-spin" />
                    </div>
                }>
                    <ClientDashboard
                        customer={customer ?? null}
                        activeSubscription={activeSubscription ?? null}
                        allSubscriptions={allSubscriptions ?? []}
                        userEmail={user.email ?? ''}
                    />
                </Suspense>
            </main>
        </div>
    )
}
