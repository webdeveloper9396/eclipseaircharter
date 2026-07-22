import { ReactNode, useState } from "react";
import { Phone, Mail, Menu, X } from "lucide-react";
import eclipseLogo from "@/assets/eclipse-logo.jpg";

interface PublicLayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { label: "Home", href: "https://www.eclipseaircharter.com/" },
  { label: "Why Eclipse", href: "https://eclipseaircharter.com/about" },
  { label: "Empty Legs", href: "https://search.eclipseaircharter.com/search", external: false },
  { label: "Contact Us", href: "https://eclipseaircharter.com/contact" },
];

const CONTACT = {
  uk: { label: "U.K", number: "+44 203 7587 299", tel: "+442037587299" },
  canada: { label: "CANADA", number: "+1 416 646 7323", tel: "+14166467323" },
  email: "charter@eclipseaircharter.com",
};

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="eclipse-public min-h-screen bg-background flex flex-col">
      {/* Contact Bar */}
      <div className="bg-[hsl(220,13%,15%)]">
        {/* Mobile: simplified contact bar */}
        <div className="sm:hidden max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-[#b7a369]">
          <Phone className="h-3.5 w-3.5" />
          <a href={`tel:${CONTACT.canada.tel}`} className="font-bold hover:underline transition-colors text-sm">
            {CONTACT.canada.number}
          </a>
          <span>|</span>
          <a href={`mailto:${CONTACT.email}`} className="font-bold hover:underline transition-colors text-sm">
            <Mail className="h-3.5 w-3.5 inline mr-1" />Email
          </a>
        </div>
        {/* Desktop: full contact bar */}
        <div className="hidden sm:flex max-w-6xl mx-auto px-4 sm:px-6 py-2 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[#b7a369]">
          <span className="uppercase tracking-wider">CONTACT US</span>
          <span>|</span>
          <span>{CONTACT.uk.label}</span>
          <a href={`tel:${CONTACT.uk.tel}`} className="font-bold hover:underline transition-colors">
            {CONTACT.uk.number}
          </a>
          <span>|</span>
          <span>{CONTACT.canada.label}</span>
          <a href={`tel:${CONTACT.canada.tel}`} className="font-bold hover:underline transition-colors">
            {CONTACT.canada.number}
          </a>
          <span>|</span>
          <span>Email:</span>
          <a href={`mailto:${CONTACT.email}`} className="font-bold hover:underline transition-colors">
            {CONTACT.email}
          </a>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="border-b border-border bg-background sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center relative">
          {/* Brand: OneWay by [Eclipse Logo] */}
          <a href="https://eclipseaircharter.com" target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img
              src={eclipseLogo}
              alt="Eclipse Air Charter"
              className="h-[76px] w-auto object-contain"
            />
          </a>

          {/* Desktop Nav Links — centered */}
          <div className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
            {NAV_LINKS.map((link) =>
              link.external === false ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm uppercase tracking-wider text-foreground/70 hover:text-foreground transition-colors font-bold"
                >
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm uppercase tracking-wider text-foreground/70 hover:text-foreground transition-colors font-bold"
                >
                  {link.label}
                </a>
              )
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 text-foreground/70 hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.external === false ? link.href : link.href}
                target={link.external === false ? undefined : "_blank"}
                rel={link.external === false ? undefined : "noopener noreferrer"}
                className="block text-sm text-foreground/70 hover:text-foreground py-1.5 font-bold"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-white text-sm text-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Logo */}
            <a href="https://eclipseaircharter.com" target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <img src={eclipseLogo} alt="Eclipse Air Charter" className="h-20 w-auto object-contain" />
            </a>

            {/* Contact section */}
            <div className="flex-1">
              <h3 className="font-bold uppercase tracking-wider mb-6">
                Contact Us
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div className="flex flex-col items-center sm:items-start gap-3">
                  <div className="w-10 border-t border-border" />
                  <a href={`tel:${CONTACT.canada.tel}`} className="flex items-center gap-2 hover:text-[#b7a369] transition-colors">
                    <Phone className="h-4 w-4" />
                    +1 416 646 7323 (Canada &amp; USA)
                  </a>
                </div>
                <div className="flex flex-col items-center sm:items-start gap-3">
                  <div className="w-10 border-t border-border" />
                  <a href={`tel:${CONTACT.uk.tel}`} className="flex items-center gap-2 hover:text-[#b7a369] transition-colors">
                    <Phone className="h-4 w-4" />
                    +44 203 758 7299 (Europe)
                  </a>
                </div>
                <div className="flex flex-col items-center sm:items-start gap-3">
                  <div className="w-10 border-t border-border" />
                  <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 hover:text-[#b7a369] transition-colors">
                    <Mail className="h-4 w-4" />
                    {CONTACT.email}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright bar */}
        <div className="bg-[hsl(0,0%,96%)] py-3">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} <a href="https://eclipseaircharter.com/" target="_blank" rel="noopener noreferrer" className="hover:text-[#b7a369] transition-colors">Eclipse Air Charter</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
