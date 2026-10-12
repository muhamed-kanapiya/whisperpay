import { SiteHeader } from "@/components/site-header";
import { DemoWarning } from "@/components/demo-warning";
import { Roadmap } from "@/components/landing/roadmap";
import { CorporateSection } from "@/components/landing/corporate-section";
import { DemoSection, FinalCTA, Footer, Hero, HowItWorks, PaymentFeatures, WhySolana } from "@/components/landing/sections";
export default function HomePage() {
  return <><SiteHeader /><main id="main"><Hero /><HowItWorks /><DemoSection /><WhySolana /><PaymentFeatures /><CorporateSection /><Roadmap /><FinalCTA /></main><DemoWarning /><Footer /></>;
}
