import LoginForm from './LoginForm'

export default async function LoginPage({
    searchParams,
}: {
    searchParams?: Promise<{ error?: string; message?: string; next?: string; email?: string }>
}) {
    const params = await searchParams
    return (
        <LoginForm
            error={params?.error}
            message={params?.message}
            nextUrl={params?.next || '/dashboard'}
            prefillEmail={params?.email}
        />
    )
}
