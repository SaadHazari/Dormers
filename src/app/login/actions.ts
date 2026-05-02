'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        const params = new URLSearchParams({ error: error.message, email: data.email })
        redirect(`/login?${params.toString()}`)
    }

    revalidatePath('/', 'layout')
    const nextUrl = formData.get('next_url') as string || '/dashboard'
    redirect(nextUrl)
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { data: authData, error } = await supabase.auth.signUp(data)

    if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`)
    }

    // If email confirmation is required, session will be null — prompt the user to check their inbox
    if (!authData.session) {
        redirect(`/login?message=${encodeURIComponent('Account created! Check your email to confirm before signing in.')}`)
    }

    revalidatePath('/', 'layout')
    const nextUrl = formData.get('next_url') as string || '/dashboard'
    redirect(nextUrl)
}

export async function signout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/home')
}

export async function requestPasswordReset(formData: FormData) {
    const supabase = await createClient()
    const email = (formData.get('email') as string || '').trim()

    if (!email) {
        redirect(`/login?error=${encodeURIComponent('Please enter your email address.')}`)
    }

    await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3004'}/auth/confirm?next=/login`,
    })

    // Always confirm — never disclose whether the email exists
    redirect(`/login?message=${encodeURIComponent("If an account exists for that email, we've sent a reset link.")}`)
}