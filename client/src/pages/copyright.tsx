import { Layout } from "@/components/layout";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Copyright() {
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
          
          <h1 className="text-2xl font-bold mb-6">Copyright Notice</h1>
          
          <div className="space-y-6 text-muted-foreground">
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Copyright Ownership</h2>
              <p>
                © 2026 SWAY. All rights reserved.
              </p>
              <p className="mt-2">
                The SWAY application, including its design, code, graphics, logos, icons, images, audio clips, 
                digital downloads, data compilations, and software, is the property of SWAY and is protected by 
                United States and international copyright laws.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Protected Content</h2>
              <p>The following elements are protected by copyright:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>SWAY brand name, logos, and visual identity</li>
                <li>Application user interface design and layout</li>
                <li>Original software code and algorithms</li>
                <li>Written content, including help text and documentation</li>
                <li>Graphics, icons, and illustrations</li>
                <li>Audio and visual elements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Third-Party Content</h2>
              <p>
                Market data, pricing information, and event descriptions are provided through integration with 
                third-party prediction market platforms including Kalshi and DFlow. Such content remains the 
                property of its respective owners and is used under license or with permission.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Permitted Use</h2>
              <p>You are permitted to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Use the application for personal, non-commercial purposes</li>
                <li>Share links to the application with others</li>
                <li>Take screenshots for personal reference</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Prohibited Use</h2>
              <p>Without express written permission from SWAY, you may not:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Copy, reproduce, or duplicate any content from the application</li>
                <li>Modify, adapt, or create derivative works</li>
                <li>Distribute, publish, or publicly display copyrighted materials</li>
                <li>Use content for commercial purposes</li>
                <li>Remove or alter any copyright notices or attributions</li>
                <li>Use automated tools to scrape or extract content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Trademarks</h2>
              <p>
                SWAY and associated logos are trademarks of SWAY. Other product and company names mentioned 
                within the application may be trademarks of their respective owners. Use of these trademarks 
                without express permission is prohibited.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">DMCA Compliance</h2>
              <p>
                SWAY respects the intellectual property rights of others. If you believe that your copyrighted 
                work has been copied in a way that constitutes copyright infringement, please provide us with 
                the following information:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>A description of the copyrighted work that you claim has been infringed</li>
                <li>A description of where the material is located in our application</li>
                <li>Your contact information</li>
                <li>A statement that you have a good faith belief that the use is not authorized</li>
                <li>A statement that the information is accurate and that you are authorized to act on behalf of the copyright owner</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Enforcement</h2>
              <p>
                SWAY actively monitors and enforces its intellectual property rights. Violations of this 
                copyright notice may result in legal action, including claims for damages and injunctive relief.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Contact</h2>
              <p>
                For copyright inquiries, licensing requests, or to report copyright infringement, please 
                contact us through the application's support channels.
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
