import { Layout } from "@/components/layout";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function License() {
  return (
    <Layout>
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-2xl mx-auto">
          <Link href="/profile">
            <a className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <ArrowLeft size={20} />
              Back
            </a>
          </Link>
          
          <h1 className="text-2xl font-bold mb-6">License Agreement</h1>
          
          <div className="space-y-6 text-muted-foreground">
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">1. Grant of License</h2>
              <p>
                SWAY grants you a limited, non-exclusive, non-transferable, revocable license to access and use 
                the SWAY mobile application and associated services for personal, non-commercial use, subject to 
                the terms and conditions of this Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">2. Restrictions</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Copy, modify, or distribute the application or its content</li>
                <li>Reverse engineer, decompile, or disassemble the application</li>
                <li>Use the application for any illegal or unauthorized purpose</li>
                <li>Attempt to gain unauthorized access to any part of the service</li>
                <li>Use automated systems or software to extract data from the application</li>
                <li>Interfere with or disrupt the integrity or performance of the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">3. Prediction Markets</h2>
              <p>
                SWAY provides access to prediction markets through third-party services. Trading on prediction 
                markets involves financial risk. You acknowledge that you are solely responsible for any trades 
                you make and understand that you may lose some or all of your invested capital.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">4. Eligibility</h2>
              <p>
                You must be at least 18 years of age and legally permitted to participate in prediction markets 
                in your jurisdiction to use this service. You are responsible for ensuring compliance with all 
                applicable local laws and regulations.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">5. Intellectual Property</h2>
              <p>
                All intellectual property rights in the application, including but not limited to trademarks, 
                trade names, logos, and copyrighted materials, are owned by SWAY or its licensors. This license 
                does not grant you any ownership rights in the application.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">6. Disclaimer of Warranties</h2>
              <p>
                THE APPLICATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. SWAY 
                DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR 
                PURPOSE, AND NON-INFRINGEMENT.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">7. Limitation of Liability</h2>
              <p>
                IN NO EVENT SHALL SWAY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR 
                PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR OTHER INTANGIBLE 
                LOSSES, ARISING OUT OF YOUR USE OF THE APPLICATION.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">8. Termination</h2>
              <p>
                SWAY may terminate or suspend your access to the application at any time, without prior notice 
                or liability, for any reason, including if you breach any terms of this Agreement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">9. Changes to Terms</h2>
              <p>
                SWAY reserves the right to modify this license agreement at any time. Continued use of the 
                application after any changes constitutes your acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
              <p>
                For questions about this license agreement, please contact us through the application's support 
                channels.
              </p>
            </section>

            <p className="text-sm text-muted-foreground/70 pt-4 border-t border-border">
              Last updated: January 2026
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
