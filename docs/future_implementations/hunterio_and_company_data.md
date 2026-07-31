For a polished B2B SaaS, I'd separate company enrichment from brand assets. Companies that try to do both usually excel at one more than the other.

Here's what I'd recommend:

Service	Company data	Logo	Brand colors/fonts	My recommendation
Hunter	✅	✅ (free Logo API)	❌	Great if you're already using Hunter.
People Data Labs	⭐⭐⭐⭐⭐	Sometimes	❌	Best overall company dataset.
Apollo	⭐⭐⭐⭐☆	Usually	❌	Excellent for B2B sales data.
Brandfetch	Basic	⭐⭐⭐⭐⭐	⭐⭐⭐⭐⭐	Best visual experience.
HubSpot/Clearbit	⭐⭐⭐⭐☆	Yes	❌	Good enrichment, but the legacy free Logo API is gone.
If it were my SaaS

I'd actually use two APIs.

1. Hunter (or People Data Labs)

Input:

john@airbnb.com

Returns:

Company name
Domain
Website
Industry
Employee count
Headquarters
LinkedIn
Technologies
Description
2. Brandfetch

Input:

airbnb.com

Returns:

SVG logo
PNG logo
Icon/favicon
Brand colors
Fonts
Social profiles

The result looks much more polished than just showing a tiny favicon.


What I'd choose today

For a modern B2B SaaS, my stack would be:

People Data Labs → authoritative company information.
Brandfetch → high-quality logos, SVGs, icons, and brand colors
