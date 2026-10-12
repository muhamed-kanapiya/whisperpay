import { SiteHeader } from "@/components/site-header";
import { DemoWarning } from "@/components/demo-warning";
import { DemoSection, FinalCTA, Footer, Hero, HowItWorks, PaymentFeatures, WhySolana } from "@/components/landing/sections";
export default function HomePage() {
  return <><SiteHeader /><main id="main"><Hero /><HowItWorks /><DemoSection /><WhySolana /><PaymentFeatures /><FinalCTA /></main><DemoWarning /><Footer /></>;
}
