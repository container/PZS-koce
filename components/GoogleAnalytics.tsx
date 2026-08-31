"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const measurementId = "G-450HJ970FM";
const consentKey = "pzs-analytics-consent";

type Consent = "accepted" | "rejected" | null;

export function GoogleAnalytics() {
  const [consent, setConsent] = useState<Consent>(null);

  useEffect(() => {
    const storedConsent = window.localStorage.getItem(consentKey);
    if (storedConsent === "accepted" || storedConsent === "rejected") {
      setConsent(storedConsent);
    }
  }, []);

  const chooseConsent = (choice: Exclude<Consent, null>) => {
    window.localStorage.setItem(consentKey, choice);
    setConsent(choice);
  };

  return (
    <>
      {consent === "accepted" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`}
          </Script>
        </>
      )}

      {consent === null && (
        <section className="analytics-consent" aria-label="Nastavitve analitike">
          <p>
            Google Analytics uporabljamo za razumevanje uporabe spletnega mesta.
            Analitične piškotke lahko sprejmete ali zavrnete.
          </p>
          <div>
            <button type="button" onClick={() => chooseConsent("rejected")}>Zavrni</button>
            <button type="button" className="analytics-consent-accept" onClick={() => chooseConsent("accepted")}>Sprejmi analitiko</button>
          </div>
        </section>
      )}
    </>
  );
}
