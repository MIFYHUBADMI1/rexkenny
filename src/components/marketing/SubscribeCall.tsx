import { isEmailConfigured } from "@/lib/config";
import { NewsletterForm } from "@/components/forms/NewsletterForm";

export function SubscribeCall() {
  return (
    <section className="py-16 md:py-24">
      <div className="container-page">
        <div className="overflow-hidden rounded-xl border border-gold-deep/30 bg-gradient-to-br from-ink-raised to-charcoal p-8 md:p-12">
          <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <p className="eyebrow">Fan list</p>
              <h2 className="mt-2 text-3xl font-bold">Hear it first</h2>
              <p className="mt-3 max-w-md leading-relaxed text-smoke">
                New releases, video premieres and show dates — sent to people who ask
                for them. No selling or sharing of your address, and one-click
                unsubscribe in every email.
              </p>
            </div>
            {isEmailConfigured ? (
              <NewsletterForm />
            ) : (
              <div className="rounded-lg border border-dashed border-ash bg-ink/60 p-6 text-sm">
                <p className="font-semibold text-gold">Email signup is offline</p>
                <p className="mt-2 leading-relaxed text-smoke">
                  Email signup is temporarily unavailable — please check back
                  soon. Signups are never stored in a way that pretends to work.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
