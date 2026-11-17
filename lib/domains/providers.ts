import { z } from "zod";
import {
  siCloudflare, siGodaddy, siHostinger, siIonos, siNamecheap,
  siPorkbun, siSquarespace, siVercel, siWix,
} from "simple-icons";

type Logo = { path: string; hex: string } | { initials: string };
export type DomainProvider = {
  id: string;
  name: string;
  logo: Logo;
  dnsUrl: string;
  nameservers: readonly RegExp[];
  steps: readonly string[];
  videoUrl?: string;
};

const finish = [
  "Add the A record below. Use @ for the root name, or the full name if your provider requires it.",
  "Add the CNAME record below with www as the name. Copy the target exactly.",
  "Add any TXT verification records shown below, save your changes, then return here to check.",
];

export const domainProviders: readonly DomainProvider[] = [
  { id: "godaddy", name: "GoDaddy", logo: siGodaddy, dnsUrl: "https://dcc.godaddy.com/domains",
    nameservers: [/\.domaincontrol\.com$/],
    steps: ["Log in to GoDaddy and open My Products.", "Find your domain, click DNS, then Add New Record.", ...finish] },
  { id: "namecheap", name: "Namecheap", logo: siNamecheap, dnsUrl: "https://ap.www.namecheap.com/domains/list/",
    nameservers: [/\.registrar-servers\.com$/, /\.namecheaphosting\.com$/],
    steps: ["Log in to Namecheap and open Domain List.", "Click Manage next to your domain, then Advanced DNS and Add New Record.", ...finish] },
  { id: "cloudflare", name: "Cloudflare", logo: siCloudflare, dnsUrl: "https://dash.cloudflare.com/",
    nameservers: [/\.ns\.cloudflare\.com$/],
    steps: ["Log in to Cloudflare and select your domain.", "Open DNS, then Records and Add record. Set these website records to DNS only (the gray cloud) while connecting.", ...finish] },
  { id: "squarespace", name: "Squarespace Domains (formerly Google Domains)", logo: siSquarespace,
    dnsUrl: "https://account.squarespace.com/domains",
    nameservers: [/\.googledomains\.com$/, /\.squarespacedns\.com$/],
    steps: ["Log in to Squarespace and open Domains.", "Choose your domain, then DNS and DNS Settings. Under Custom Records, choose Add Record.", ...finish] },
  { id: "wix", name: "Wix", logo: siWix, dnsUrl: "https://manage.wix.com/account/domains",
    nameservers: [/\.wixdns\.net$/, /\.wix\.com$/],
    steps: ["Log in to Wix and open Domains.", "Choose your domain, open its actions menu, then Manage DNS Records and Add Record.", ...finish] },
  { id: "bluehost", name: "Bluehost", logo: { initials: "BH" }, dnsUrl: "https://my.bluehost.com/",
    nameservers: [/\.bluehost\.com$/],
    steps: ["Log in to your Bluehost account and open Domains.", "Choose your domain, open DNS or Advanced DNS, then Add Record.", ...finish] },
  { id: "hostgator", name: "HostGator", logo: { initials: "HG" }, dnsUrl: "https://portal.hostgator.com/",
    nameservers: [/\.hostgator\.com$/, /^ns\d+\.hostgator\.(?:com\.br|in)$/, /^ns\d+\.websitewelcome\.com$/],
    steps: ["Log in to the HostGator customer portal and open your hosting control panel.", "In cPanel, open Zone Editor, find your domain and choose Manage, then Add Record.", ...finish] },
  { id: "hostinger", name: "Hostinger", logo: siHostinger, dnsUrl: "https://hpanel.hostinger.com/domains",
    nameservers: [/\.dns-parking\.com$/, /\.hostinger\.(?:com|in)$/],
    steps: ["Log in to Hostinger hPanel and open Domains.", "Select your domain, open DNS / Nameservers, then Manage DNS Records.", ...finish] },
  { id: "ionos", name: "IONOS", logo: siIonos, dnsUrl: "https://my.ionos.com/domains",
    nameservers: [/\.ui-dns\.(?:com|org|biz|de)$/, /\.1and1\.(?:com|co\.uk|de)$/],
    steps: ["Log in to IONOS and open Domains & SSL.", "Click your domain, open DNS and choose Add record.", ...finish] },
  { id: "network-solutions", name: "Network Solutions", logo: { initials: "NS" }, dnsUrl: "https://www.networksolutions.com/my-account/",
    nameservers: [/\.worldnic\.com$/],
    steps: ["Log in to Network Solutions and open My Domain Names.", "Select your domain, open Advanced DNS Records and choose Add Record or Edit.", ...finish] },
  { id: "porkbun", name: "Porkbun", logo: siPorkbun, dnsUrl: "https://porkbun.com/account/domainsSpeedy",
    nameservers: [/\.ns\.porkbun\.com$/],
    steps: ["Log in to Porkbun and open Domain Management.", "Find your domain, open Details, then click Edit next to DNS Records.", ...finish] },
  { id: "route53", name: "Amazon Route 53", logo: { initials: "R53" }, dnsUrl: "https://console.aws.amazon.com/route53/v2/hostedzones",
    nameservers: [/\.awsdns-\d+\.(?:com|net|org|co\.uk)$/],
    steps: ["Log in to the AWS console and open Route 53, then Hosted zones.", "Choose your domain's public hosted zone and click Create record. Turn Alias off for the A record.", ...finish] },
  { id: "vercel", name: "Vercel", logo: siVercel, dnsUrl: "https://vercel.com/dashboard/domains",
    nameservers: [/\.vercel-dns\.com$/],
    steps: ["Log in to your DNS account and open Domains.", "Select your domain and open DNS Records. If the records below already exist, leave them in place.", ...finish] },
  { id: "other", name: "Other", logo: { initials: "DNS" }, dnsUrl: "",
    nameservers: [],
    steps: ["Log in to the company that manages your domain's DNS.", "Open your domain's DNS records, zone editor or DNS management page.", ...finish] },
];

export const providerIdSchema = z.string().refine((value) => domainProviders.some((provider) => provider.id === value), "Choose a DNS provider.");
export function getProvider(id: string): DomainProvider {
  return domainProviders.find((provider) => provider.id === id) ?? domainProviders[domainProviders.length - 1];
}

export function providerFromNameservers(nameservers: string[]): DomainProvider {
  return domainProviders.find((provider) => nameservers.some((name) =>
    provider.nameservers.some((pattern) => pattern.test(name.toLowerCase().replace(/\.$/, ""))))) ?? getProvider("other");
}
