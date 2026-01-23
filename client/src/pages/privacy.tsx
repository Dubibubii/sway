import { Layout } from "@/components/layout";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Privacy() {
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
          
          <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
          
          <div className="space-y-6 text-muted-foreground">
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Introduction</h2>
              <p>
                SWAY ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
                explains how we collect, use, disclose, and safeguard your information when you use our 
                mobile application and related services.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Information We Collect</h2>
              
              <h3 className="font-medium text-foreground mt-4 mb-2">Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Wallet addresses when you connect your Solana wallet</li>
                <li>Account preferences and settings</li>
                <li>Transaction history and trading activity</li>
                <li>Communications with our support team</li>
              </ul>

              <h3 className="font-medium text-foreground mt-4 mb-2">Information Collected Automatically</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Device information (type, operating system, unique identifiers)</li>
                <li>Usage data (pages viewed, features used, time spent)</li>
                <li>IP address and general location data</li>
                <li>App performance and error logs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Provide, maintain, and improve our services</li>
                <li>Process your transactions and manage your account</li>
                <li>Send you important updates about our services</li>
                <li>Respond to your inquiries and provide customer support</li>
                <li>Detect and prevent fraud, abuse, and security issues</li>
                <li>Analyze usage patterns to improve user experience</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Information Sharing</h2>
              <p>We may share your information with:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>Service Providers:</strong> Third parties who help us operate our services (payment processors, analytics providers, hosting services)</li>
                <li><strong>Trading Partners:</strong> Prediction market platforms like Kalshi and DFlow to execute your trades</li>
                <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
              <p className="mt-2">
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Blockchain Data</h2>
              <p>
                When you make transactions through our app, certain information is recorded on the Solana 
                blockchain. This includes your wallet address and transaction details. Blockchain data is 
                public and immutable, meaning it cannot be deleted or modified. We have no control over 
                information recorded on the blockchain.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your information 
                against unauthorized access, alteration, disclosure, or destruction. These measures include:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments and updates</li>
                <li>Access controls and authentication mechanisms</li>
                <li>Secure wallet integration through Privy</li>
              </ul>
              <p className="mt-2">
                However, no method of transmission over the internet or electronic storage is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Your Rights</h2>
              <p>Depending on your location, you may have the right to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Access and receive a copy of your personal data</li>
                <li>Correct inaccurate or incomplete data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to or restrict processing of your data</li>
                <li>Data portability</li>
                <li>Withdraw consent at any time</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, please contact us through the app's support channels.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Data Retention</h2>
              <p>
                We retain your personal information for as long as necessary to fulfill the purposes for 
                which it was collected, including to satisfy legal, accounting, or reporting requirements. 
                When your data is no longer needed, we will securely delete or anonymize it.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Children's Privacy</h2>
              <p>
                Our services are not intended for individuals under 18 years of age. We do not knowingly 
                collect personal information from children. If we learn that we have collected personal 
                information from a child, we will take steps to delete that information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">International Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your country 
                of residence. These countries may have different data protection laws. We take appropriate 
                safeguards to ensure your information remains protected.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by 
                posting the new policy on this page and updating the "Last updated" date. We encourage you 
                to review this policy periodically.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mb-2">Contact Us</h2>
              <p>
                If you have questions or concerns about this Privacy Policy or our data practices, please 
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
