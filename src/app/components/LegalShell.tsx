'use client';

import { useEffect } from 'react';

/**
 * Shared chrome for legal pages (Privacy Policy, Terms & Conditions).
 * Both pages had ~80% identical wrappers — navy bg, content container,
 * scroll-to-top on mount, header with title + "Last updated", and a
 * closing italic note. Pulled up here.
 *
 * Body sections (numbered `<section>` blocks) stay per-page as
 * `children` — the only meaningful divergence between the two.
 */
export function LegalShell({
    title,
    closingText,
    children,
}: {
    title: string
    closingText: string
    children: React.ReactNode
}) {
    // Scroll to top on mount — legal pages are usually navigated to from
    // a footer link, so resetting scroll prevents users landing mid-page.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-[#1E3A4F] py-24">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1
                        className="text-4xl sm:text-5xl font-bold text-white mb-4"
                        style={{ fontFamily: "'Lora', Georgia, serif" }}
                    >
                        {title}
                    </h1>
                    <p className="text-[#EEE9DA] text-lg">
                        Last updated: {new Date().toLocaleDateString()}
                    </p>
                </div>

                {/* Content Container */}
                <div className="max-w-4xl mx-auto bg-[#031624] rounded-3xl shadow-xl p-6 sm:p-8 md:p-12">
                    <div className="space-y-8 text-[#EEE9DA]/80">
                        {children}

                        <div className="text-center italic pt-8 border-t border-[#EEE9DA]/20">
                            {closingText}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
