SitoMax Platform — Complete Premium SaaS UI/UX and Website Editor Redesign
Role and Objective
Act as a senior SaaS product designer, UI/UX architect, and full-stack frontend engineer.
We are building SitoMax, a premium AI-powered website creation, hosting, and digital marketing platform for agencies, businesses, and individual clients.
SitoMax supports two business models:
Self-Service Website Builder: Customers create and manage their own websites using SitoMax's AI-powered builder and visual editor.
Done-for-You Website Services: SitoMax builds and manages professional websites for clients through a separate managed-service offering.
The platform also supports website management, client accounts, domains, SEO, analytics, forms, AI usage tracking, and agency operations.
The application is developed in GitHub Codespaces and deployed through Vercel.
I want you to substantially improve the visual design, layout, organization, usability, consistency, and professionalism of the entire SitoMax application.
The goal is to make SitoMax look and feel like a polished, modern, commercial SaaS product that clients trust and enjoy using.
The platform should feel competitive with leading products such as Vercel, Linear, Stripe, Webflow, and modern agency management platforms, while establishing its own unique identity.
Competitor screenshots are provided for inspiration, not duplication.
This is a comprehensive product design improvement, not simply changing colors or increasing border radii.
Do not rebuild the application from scratch or sacrifice existing functionality.

1. Inspect the Existing Application First
Before making modifications:
Inspect the current application structure, framework, routing, styling architecture, and dependencies.
Identify every existing dashboard page, editor component, API route, authentication flow, and database integration.
Review existing data models for websites, clients, domains, forms, analytics, AI usage, and settings.
Identify reusable components that should become part of a consistent design system.
Understand how agency administrators and client users are separated.
Identify current responsive behavior and accessibility issues.
Review existing UI components before introducing replacements.
Inspect the visual design references identified in Section 21.
Preserve all working features, APIs, security controls, and integrations.
Do not introduce unnecessary dependencies or database schema changes.
Do not create static interfaces that replace working application features.
Do not assume data structures or backend capabilities without inspecting the existing code.
Start with a concise implementation plan organized according to the phases in this document.
Execute only the first approved phase, then stop as instructed in Section 21.

2. Establish a Premium SitoMax Design System
Create a consistent, distinctive visual identity across the entire platform, including the dashboard, website editor, authentication pages, onboarding workflows, and client workspace.
Visual direction
The interface should be:
Modern, elegant, clean, and minimal.
Sophisticated without looking plain or unfinished.
Spacious but efficient with screen real estate.
Professional enough for agencies and business owners.
Consistent across all pages and workflows.
Easy to understand, even for nontechnical users.
Responsive on desktop, tablet, and mobile.
Colors
Use an intentional premium color system.
Recommended direction:
Main background: soft off-white or light neutral gray.
Cards and surfaces: clean white.
Primary text: deep charcoal or dark navy.
Secondary text: refined muted gray.
Borders: subtle cool gray.
Accent: controlled use of SitoMax's primary brand color.
Success: restrained green.
Warning: muted amber.
Error: refined red.
Avoid excessive bright colors, gradients, glowing effects, or unnecessarily colorful dashboards.
The application already includes configurable agency branding colors. Preserve that capability.
Use design tokens to ensure agency customization does not break readability, contrast, or application styling.
Typography
Use a polished modern sans-serif font, preferably Geist or Inter, if compatible with the existing application.
Establish clear typography hierarchy for:
Page titles.
Page descriptions.
Section headings.
KPI values.
Navigation labels.
Table headers.
Supporting text.
Buttons and inputs.
Avoid oversized headings that waste vertical space.
Design details
Implement:
Consistent card styling and border radii.
Subtle shadows where appropriate.
Harmonized button styles.
Standardized spacing.
Well-designed tables and filters.
Beautiful hover, focus, loading, disabled, and active states.
Clear status indicators.
Consistent icon usage.
Polished dropdowns, modals, drawers, and tooltips.
Skeleton loading states.
Helpful empty states.
Subtle animations and transitions.
Use animation sparingly and respect reduced-motion preferences.
The design must be beautiful without sacrificing performance.

3. Redesign the Global Dashboard Layout
The existing sidebar is functional but needs refinement.
Create a polished navigation structure.
Sidebar organization
WORKSPACE
Overview
Sites
Clients
OPERATIONS
Domain Requests
Forms
Analytics
MANAGEMENT
AI Costs
Settings
These groupings are suggested. Improve them if the existing application structure supports a more logical organization.
Sidebar improvements
Modern icon alignment and spacing.
Clear active navigation indicator.
Attractive hover states.
Well-organized navigation groups.
Collapsible sidebar on desktop where useful.
Responsive drawer on mobile.
Agency logo and name at the top.
User profile and account menu at the bottom.
Consistent navigation behavior across all pages.
Top navigation
Introduce a polished, lightweight top header.
Consider:
Breadcrumb navigation.
Current workspace identification.
Contextual page actions.
Search where useful.
User profile or workspace switching where supported.
Avoid duplicating navigation unnecessarily.
The sidebar and header should work together as a unified application shell.

4. OVERVIEW — Executive Command Center
The Overview page must be fundamentally different from the Sites page.
Currently, Overview primarily displays website cards, making it too similar to Sites.
Redesign Overview into the agency's executive command center.
It should quickly answer:
How is the agency performing?
How many websites are live?
How many clients are active?
Are leads coming in?
What requires attention?
What activity has occurred recently?
How much AI usage has been consumed?
What should I work on next?
A. Welcome and Header
Use a compact, premium header.
Example:
Good morning
"Here's what's happening across your workspace."
Include relevant actions:
New Site.
Invite Client.
The greeting should not dominate the page.
B. Key Performance Indicators
Display a balanced KPI section:
Live Websites.
Total Clients.
Website Visits — Last 30 Days.
New Leads — Last 7 Days.
AI Spending — Current Month.
Use existing available data.
Each metric should have:
Clear label.
Prominent value.
Appropriate icon.
Supporting context.
Trend comparison only when real historical data exists.
Click-through behavior where useful.
Avoid oversized cards with excessive empty space.
C. Performance Snapshot
Include a polished analytics panel displaying website activity.
Possible visualizations:
Visits over time.
Leads over time.
Previous-period comparisons when supported.
Use real data.
Do not fabricate analytics values.
When no tracking data is available, display an attractive, informative empty state.
D. Action Center
Create an operational panel showing items that require attention.
Examples when supported:
Draft websites awaiting publication.
Pending domain requests.
Domain verification issues.
Incomplete site configurations.
Pending client invitations.
Relevant account usage warnings.
Each item should provide a meaningful action.
If nothing requires attention, show a polished all-clear state.
E. Recent Activity
Display useful recent workspace activity such as:
Website created.
Website published.
Client invited.
Domain request updated.
New form submission.
Use real existing event data.
If activity tracking does not exist, do not fabricate events.
Identify any additional backend requirements separately.
F. Sites at a Glance
Include a compact preview of a few recently updated websites.
Display:
Website name.
Client.
Status.
Domain.
Last updated when available.
Quick management action.
Include a View All Sites link.
Do not duplicate the complete website gallery.
G. Quick Actions
Provide useful shortcuts:
Create Website.
Add Client.
View Submissions.
Manage Domains.
The final Overview should feel like a real business command center, not a website gallery.

5. SITES — Dedicated Website Management
Redesign Sites into a professional website management workspace.
Unlike Overview, this page must focus entirely on managing websites.
Header
Title: Sites
Description:
"Create, manage, and publish websites across your workspace."
Primary action:
+ New Site
Site management toolbar
Include:
Search websites.
Filter by All / Live / Draft.
Filter by client where supported.
Sort by name or last updated.
Grid/list view toggle.
Persist the selected view where practical.
Grid View
Create attractive, compact website cards.
Each card should show:
Website thumbnail or preview.
Website name.
Assigned client.
Live or draft status.
Domain or subdomain.
Last updated when available.
Primary Edit or Manage action.
Secondary actions in a dropdown.
Reduce excessive whitespace.
Keep website previews visually balanced.
List View
Provide a professional management table with columns such as:
Website.
Client.
Status.
Domain.
Updated.
Actions.
Optimize for users managing many websites.
Site actions
Preserve all existing actions, including:
Edit.
Pages.
Connect Domain.
Preview or Visit.
Other currently supported actions.
Do not display nonfunctional buttons.
Use appropriate confirmations for destructive actions.
Design for scalability from a few websites to hundreds.

6. CLIENTS — Professional Client Management
The existing Clients page is too basic.
Transform it into a professional client management experience.
Header
Title: Clients
Description:
"Manage client relationships, websites, and account access."
Primary action:
+ Add Client
Summary metrics
When supported, include:
Total Clients.
Active Accounts.
Pending Invitations.
Assigned Websites.
Client directory
Create a searchable, filterable client directory.
Recommended columns:
Client / Business.
Account Owner.
Websites.
Account Status.
Joined Date.
Actions.
Provide clean table styling and responsive behavior.
Client details
Clicking a client should open a professional details page or drawer.
Include existing available information:
Client information.
Associated websites.
Account owner.
User access.
Invitations.
Invitation status.
AI usage allowance where supported.
Relevant account actions.
Client invitations
Improve the invitation experience.
Use a polished interface with:
Email input.
Supported role selection.
Invitation action.
Pending/sent states.
Success and error feedback.
Do not invent unsupported roles.
Maintain strict client data isolation and existing permission rules.

7. DOMAIN REQUESTS — Domain Operations Center
The current Domain Requests page is almost entirely empty.
Redesign it into a professional domain workflow management experience.
Header
Title: Domain Requests
Description:
"Track domain connections, DNS setup, and verification."
Summary metrics
When supported:
Total Requests.
Pending.
In Progress.
Completed.
Failed / Action Required.
Request table
Include:
Domain.
Associated Website.
Client.
Status.
Requested Date.
Last Updated.
Actions.
Support search and status filters.
Request details
Create a well-organized details panel showing available information about:
Requested domain.
Website.
Client.
DNS records.
Current setup progress.
Verification status.
Required next steps.
Available completion actions.
Make technical instructions understandable to nontechnical users.
Important existing behavior
The current application distinguishes between marking a request Done and actual domain verification.
Preserve this distinction.
Do not present a completed administrative request as a successfully verified domain unless verification has actually succeeded.
Preserve existing notification and retry behavior.
Empty state
When no requests exist, show a premium empty state.
Example:
"No domain requests yet. Requests from your client websites will appear here."
Avoid giant empty containers.

8. FORMS — Lead and Submission Management
Transform the current Forms page into a polished form submission center.
Header
Title: Forms & Submissions
Description:
"Capture, organize, and manage inquiries from your websites."
Summary metrics
Where real data exists:
Total Submissions.
New Submissions.
Submissions This Month.
Websites Receiving Leads.
Toolbar
Include:
Website filter.
Date range.
Search submissions.
Export CSV.
Preserve the existing export functionality.
Submission table
Display available fields such as:
Contact Name.
Email.
Source Website.
Form.
Submitted Date.
Status if supported.
Actions.
Respect arbitrary form schemas.
Submission details
Open submissions in a polished detail drawer or page.
Display:
Submitted fields and answers.
Submission date/time.
Source website.
Contact details where available.
Copy actions where appropriate.
Preserve the existing data model and privacy protections.
Empty state
Show an attractive explanation when no submissions exist.
Provide useful configuration guidance where appropriate.

9. ANALYTICS — Professional Website Intelligence
Redesign Analytics into a premium data-driven workspace.
Header
Title: Analytics
Description:
"Understand your website traffic, visitor behavior, and engagement."
Filters
Include:
Website selector.
Date range.
Period comparison when supported.
Key metrics
Show:
Total Visits.
Unique Visitors.
Form Submissions.
Conversion Rate when correctly measurable.
Use real data.
Only show percentage changes when comparable periods are available.
Traffic visualization
Create a polished chart showing visits over time.
Use existing tracking data.
Supporting analytics sections
Traffic Performance
Visits by day.
Traffic trends.
Visitor Insights
Device breakdown.
Top referrers.
Content Performance
Top visited pages.
Lead Performance
Form submissions.
Conversion trends where supported.
Critical requirements
Respect the existing tracking methodology.
The current application notes that visitor identifiers change daily.
Do not mislabel daily unique visitors as globally deduplicated unique individuals across an entire month.
Preserve existing UTC date logic unless intentionally converting dates for display.
Do not fabricate traffic, visitor information, or conversion rates.
Replace empty charts with useful, polished empty states.

10. AI COSTS — AI Usage and Financial Monitoring
Transform AI Costs into a professional usage and spending management workspace.
Header
Title: AI Usage & Costs
Description:
"Monitor AI usage, estimated spending, and client allocation."
Summary metrics
When supported:
Current Month AI Spend.
Total AI Requests.
Active AI Clients.
Average Cost Per Request.
Usage visualization
Where historical data exists:
Monthly spending trend.
Requests over time.
Spending by client.
Client usage table
Include:
Client.
Associated Sites where supported.
AI Requests.
Estimated Cost.
Usage Allowance.
Usage Percentage when available.
Critical cost behavior
The application uses configured token rates to estimate AI costs.
Preserve this calculation model.
Clearly distinguish:
Recorded usage.
Pending reservations.
Estimated costs.
Actual charges if available.
Never present estimated usage costs as confirmed billing charges.
Use sensible currency formatting.
Display $0.00 for summary metrics.
Use additional decimal precision only when appropriate for small costs.
When there is no usage, show a useful empty state.

11. SETTINGS — Premium Workspace Configuration
Redesign Settings from a basic form into a professional configuration workspace.
Settings organization
Organize available settings into logical categories.
Agency Profile
Agency Name.
Support Email.
Existing organization details.
Branding
Agency Logo.
Primary Brand Color.
Branding Preview.
Workspace Preferences
Existing supported workspace settings.
Account & Access
Existing supported access controls.
Only display controls backed by real functionality.
Layout
On desktop, consider:
Left-side settings navigation.
Main configuration content.
Clear section headings.
Helpful descriptions.
Consistent input sizes.
Well-positioned Save buttons.
Branding experience
Improve logo uploads with:
Preview.
File type and size guidance.
Replace/remove options when supported.
Validation feedback.
Show how the selected brand color affects application components.
Saving experience
Include:
Unsaved change detection where appropriate.
Loading states.
Success/error notifications.
Validation.
Protection against accidental loss of changes.
Maintain secure workspace scoping.

12. Shared UX Improvements Across All Pages
Build reusable components rather than individually styling each page.
Suggested components:
DashboardPageHeader
StatCard
SectionHeader
DataTable
StatusBadge
SearchInput
FilterToolbar
EmptyState
LoadingSkeleton
ConfirmDialog
DetailDrawer
ActionMenu
DateRangeSelector
FormField
ChartContainer
Component names should follow existing project conventions.
Empty states
Empty states are especially important while SitoMax is growing.
Do not display giant empty charts, blank tables, or meaningless containers.
Create polished empty states with:
Tasteful icon.
Short explanation.
Relevant next action where supported.
Responsive behavior
The dashboard must work beautifully on:
Large desktop monitors.
Standard laptops.
Tablets.
Mobile phones.
On smaller screens:
Collapse navigation appropriately.
Stack metrics intelligently.
Prevent horizontal overflow.
Adapt tables where necessary.
Keep important actions accessible.
Accessibility
Include:
Keyboard navigation.
Visible focus states.
Accessible labels.
Sufficient contrast.
Semantic markup.
Accessible dialogs and menus.
Readable chart alternatives.

13. Agency and Client Experience
SitoMax serves both agencies and clients.
The application must respect this distinction.
Agency Admin
Agency administrators should access the agency-wide management experience according to their existing permissions.
Client User
Clients must see only the information and actions they are authorized to access.
Protect:
Other clients' websites.
Other clients' submissions.
Other clients' analytics.
Other clients' domain information.
Agency-wide AI spending.
Administrative settings.
Preserve existing authentication and authorization.
Enforce permissions at the backend, not only by hiding navigation or UI controls.
Do not introduce cross-client data leakage.

14. Performance and Production Quality
This is a production application deployed through Vercel.
Prioritize:
Fast page loads.
Efficient rendering.
Minimal dependencies.
Maintainable components.
Optimized website preview images.
Responsive images.
Minimal layout shifts.
Clear architecture.
Appropriate loading states.
Reliable error handling.
Do not add expensive backend queries purely for decorative dashboard elements.
Use existing data wherever possible.
If an improvement requires backend support that does not exist, identify the dependency rather than faking functionality.

15. Implementation Strategy
Implement the redesign in controlled phases while preserving a working application.
Phase 1 — Design Foundation
Inspect the current architecture.
Review visual reference files.
Create or refine design tokens.
Improve global sidebar and header.
Standardize typography, spacing, colors, buttons, cards, and inputs.
Establish shared components.
Verify responsive foundations.
Phase 2 — Overview and Sites
Redesign Overview as an executive dashboard.
Redesign Sites as a dedicated website management page.
Eliminate unnecessary duplication.
Improve site cards.
Implement list view where feasible.
Preserve site actions.
Phase 3 — Client and Operations Pages
Redesign:
Clients.
Domain Requests.
Forms.
Improve tables, empty states, detail panels, filters, and interactions.
Preserve all operational workflows.
Phase 4 — Analytics, AI Costs, and Settings
Redesign:
Analytics.
AI Costs.
Settings.
Use cohesive metrics, charts, tables, inputs, and configuration layouts.
Phase 5 — Dashboard Polish and Validation
Verify visual consistency.
Test responsive layouts.
Validate navigation.
Test existing actions.
Verify authentication and data isolation.
Fix accessibility issues.
Run available tests.
Run lint, type checks, and production build.
Resolve introduced issues.
Remove obsolete components from the redesign.
Phase 5 completes the core dashboard redesign.
Phase 6 — Website Editor Redesign
Redesign the editor interface using the same design system.
This phase is detailed in Section 19.
Preserve all editor functionality, interactions, shortcuts, and security behavior.
Phase 7 — Additional Platform Screens
Apply the same design system to the additional screens described in Section 20.
This includes authentication, onboarding, wizards, error pages, and the client-facing dashboard.
Do not begin Phase 7 until Phase 6 has been completed, validated, committed, pushed, and reviewed.

16. Quality Standards and Acceptance Criteria
The redesign will be successful when:
SitoMax looks like a cohesive premium SaaS product.
Overview and Sites have clearly different purposes.
Every dashboard page has a professional layout.
Navigation is intuitive.
Tables, forms, filters, and cards have consistent styling.
Empty states are useful and attractive.
The UI avoids excessive blank space.
Important information is easily accessible.
All working functionality is preserved.
No fabricated data or nonfunctional controls are introduced.
Permissions and business logic remain intact.
The application is responsive and accessible.
The visual editor matches the dashboard's design quality.
Editor chrome is isolated from rendered website styling.
Authentication and onboarding screens feel like part of the same product.
Client users cannot access agency-wide data.
All phases pass appropriate validation and production build checks.
The resulting product must feel intentional and professionally engineered, rather than a generic UI template.

17. Design Judgment
Do not simply recreate the existing screenshots with slightly different colors.
Rethink information architecture and visual hierarchy where necessary.
For example:
Not every page needs five KPI cards.
Tables may be better than cards for operational workflows.
Empty states should be compact and helpful.
Important content should appear above the fold.
Actions should appear where users expect them.
Operational screens should prioritize efficiency.
Information of the same type should be presented consistently.
Use professional judgment.
The goal is one cohesive product, not a collection of unrelated attractive screens.

18. Final Deliverables
For each completed phase, provide:
Summary of changes implemented.
Pages or components redesigned.
Shared components created or updated.
Dependencies added and justification.
Backend changes or outstanding requirements.
Results of lint, type checks, tests, and production build.
Known limitations.
Git commit hash.
Git push result.
Recommended items for review before the next phase.
Do not claim validation passed unless the checks actually ran successfully.

19. Editor Redesign — Same Premium Design System
Redesign the SitoMax visual website editor's application interface.
This includes the editor navigation, toolbars, panels, inspectors, modals, selection controls, and editing workflow.
Do not redesign or unexpectedly alter the website content rendered inside the editor.
The editor must share the dashboard's premium design language while remaining optimized for website creation.
The editor should feel like a polished, professional website-building application.
A. Editor Top Bar
Create a modern and organized editor header containing:
Site and page breadcrumb.
Page switcher.
Desktop, tablet, and mobile device toggles.
Zoom controls.
Undo.
Redo.
Save status.
History.
Theme.
Ask AI.
Preview.
Publish as the primary action.
Group lower-priority actions inside a More menu.
The top bar should have a clear information hierarchy and never feel overcrowded.
Ensure controls have consistent icons, tooltips, keyboard behavior, and active states.
The Publish button should be visually prominent without overpowering the editor.
Preserve existing publishing logic and save behavior.
B. Left Editor Rail
Redesign the left rail with these primary destinations:
Add.
Layers.
Pages.
Theme.
AI.
SEO.
Use:
Consistent icons.
Clear active indicators.
Helpful tooltips.
Collapsible panels.
Resizable panel width.
Smooth but restrained transitions.
The rail should feel organized and professional.
Do not allow panel expansion to break the editor layout.
Preserve existing panel functionality.
C. Section Library
Redesign the section library into a premium component browsing experience.
Include:
Searchable library.
Category filters.
Section thumbnails.
Clean responsive thumbnail grid.
Hover preview.
Clear section titles.
Saved Designs tab.
The library should make it easy for users to browse and insert sections.
Improve spacing, visual hierarchy, and discoverability.
Preserve existing insertion behavior.
Do not create duplicate or incompatible section systems.
The Saved Designs tab should connect to existing saved-design functionality where available.
If the feature is not yet supported, do not fabricate a functioning library.
D. Right Inspector
Create a polished editing inspector with these tabs:
Content | Design | Motion
Each tab should organize settings into logical groups.
Implement:
Clearly labeled controls.
Consistent form inputs.
Sliders and numeric inputs where appropriate.
Color pickers.
Theme color swatches.
Collapsible control groups.
Per-device override indicators.
Clear reset behavior where supported.
Helpful descriptions or tooltips for advanced settings.
The inspector should feel sophisticated but approachable to nontechnical users.
Avoid overwhelming users with poorly organized controls.
Ensure the inspector updates the selected element using existing editor state and commands.
Preserve all existing editing capabilities.
Do not introduce visual controls that are disconnected from actual editor behavior.
E. Editor Canvas
Improve the visual editing experience.
Implement:
Subtle element selection outlines.
Polished hover labels.
Clear selected-element indicators.
Contextual section toolbar.
Beautiful add-section controls.
Improved drag-and-drop visual feedback where supported.
Clean, consistent canvas spacing and chrome.
Selection and hover indicators should not obstruct the website being edited.
Empty Page State
When a page has no content, show a professional empty state with:
Build this page with AI
Browse designs
These actions must connect to existing functionality.
The empty state should be inviting, helpful, and consistent with the SitoMax brand.
F. AI Panel
Redesign the editor's AI panel using the same design system.
Use the shared drawer and modal patterns created for the dashboard where practical.
Provide:
Clean input areas.
Clear action buttons.
Proper loading indicators.
Error feedback.
Organized generated results.
Consistent spacing and typography.
Preserve existing AI generation behavior, usage tracking, and cost controls.
Do not modify AI prompts, workflows, or underlying request logic unless necessary for compatibility and explicitly justified.
G. Media Picker
Redesign the Media Picker with the same premium drawer/modal components.
Improve:
Asset browsing.
Grid layout.
Thumbnail presentation.
Search or filtering where supported.
Selection indicators.
Upload feedback.
Empty states.
Preserve existing media storage, uploads, and asset selection.
Do not introduce broken media references.
H. Critical Style Isolation
The editor chrome must be visually isolated from the website being rendered.
Editor chrome styles must never leak into the rendered site.
Website theme styles must never affect the editor chrome.
Inspect the existing isolation architecture.
Use appropriate techniques such as scoped styles, isolated style roots, or iframe boundaries where already supported or technically justified.
Avoid global CSS selectors that could alter customer websites.
A customer's website theme must not change the appearance of SitoMax's editor controls.
Likewise, editor styling must not alter the actual published website.
I. Responsive Editor Experience
Desktop
Provide the complete visual editing experience.
The application should support efficient editing on standard laptop and desktop screens.
Tablet
The editor must remain fully usable.
Adapt:
Side panels.
Toolbars.
Inspector.
Canvas.
Navigation.
Use collapsible or overlay panels where necessary.
Mobile Phone
Do not attempt to squeeze the complete desktop editing interface into a small screen.
Instead, show a friendly notice:
"Editing works best on a larger screen."
Include an accessible Preview action so mobile users can still view their website.
Keep the experience professional and welcoming.
J. Editor Functionality Preservation
This redesign must preserve:
Every existing editor feature.
Keyboard shortcuts.
Selection behavior.
Undo/redo.
Save behavior.
Autosave where implemented.
Publishing.
Page management.
Section insertion.
Existing AI workflows.
Media uploads.
Theme editing.
Responsive editing behavior.
Existing sanitization and content security protections.
Do not remove, weaken, or bypass the existing sanitizer.
Do not compromise content security to make visual styling easier.
Do not modify published site output unintentionally.
The editor redesign should primarily improve the application chrome, not rewrite the underlying editing engine.
Phase 6 Validation
Verify:
Editor loads existing sites.
Existing page content remains unchanged.
Selection and editing work.
Undo and redo work.
Save and publish work.
Device previews work.
AI controls remain functional.
Media Picker works.
Existing shortcuts remain operational.
No editor styles leak into published sites.
Customer theme styles do not alter editor chrome.
Tablet editing is usable.
Mobile preview remains accessible.

20. Additional Screens — Complete Platform Consistency
Apply the same SitoMax design system to all additional application screens.
These screens should not look like they belong to a different product.
A. Login
Redesign the login experience with:
Premium SitoMax branding.
Elegant layout.
Clear input fields.
Modern button styling.
Proper validation.
Loading and error states.
Responsive design.
Preserve existing authentication logic and providers.
B. Forgot Password / Set Password
Create a consistent, polished authentication flow.
Include:
Clear instructions.
Email validation.
Password requirements where applicable.
Helpful success/error feedback.
Expired-link handling.
Consistent branding.
Preserve existing token and recovery security behavior.
C. Invite Acceptance
Redesign invitation acceptance into a professional onboarding experience.
Include:
Agency/workspace identification.
Invitation context.
Clear acceptance action.
Appropriate account setup flow.
Success and error states.
Preserve existing invitation validation, expiry, roles, and permissions.
D. Branded 404 Page
Create a polished SitoMax 404 page.
Include:
Clear explanation.
Premium branded presentation.
Return to Dashboard or Home action.
Accessible navigation.
Avoid exposing internal application or routing details.
E. Build with AI Wizard
Redesign the AI-powered website creation wizard.
The interface should feel guided, premium, and easy to follow.
Improve:
Step progression.
Form organization.
Clear prompts.
Selection interfaces.
Loading/progress indicators.
Error handling.
Final review and creation steps.
Preserve existing AI generation logic.
Do not remove input options or functionality.
Ensure users understand where they are in the website creation process.
Do not fabricate progress percentages unless they reflect real or appropriately modeled workflow progress.
F. Domain Connection Wizard
Create a beautiful and understandable domain setup experience.
Organize the process into clear steps where supported:
Enter or select domain.
Review required DNS configuration.
Complete DNS setup.
Verify domain.
Confirm connection.
Use existing actual workflows and DNS values.
Make technical instructions understandable to nontechnical users.
Preserve existing validation and verification mechanisms.
Do not claim a domain is connected until verification succeeds.
G. Client-User Dashboard
Create a premium, simplified client dashboard using the same design system.
The client interface should not be a copy of the agency administration dashboard.
It should focus on the client's own website and business activity.
Client Overview
Provide relevant information such as:
Their websites.
Website status.
Recent visits.
Form submissions.
Domain connection status.
Available website actions.
Client Sites
Show only websites assigned to the authenticated client.
Support actions permitted by their role.
Client Forms
Show only form submissions associated with their authorized websites.
Client Analytics
Show only traffic and analytics for their authorized websites.
Client Domain Status
Allow clients to understand their domain configuration and verification progress.
Client AI Usage
Show usage or allowances only if appropriate for the client's subscription and supported by existing permissions.
Do not expose agency-wide spending or internal costs.
Critical Security Requirement
Client access must be enforced at the server/database authorization layer.
Do not rely only on hiding navigation items.
Never expose another client's:
Websites.
Leads.
Analytics.
Domains.
Account information.
Private AI usage.
Internal agency data.
The client dashboard should feel professional, simple, and useful without unnecessary administrative complexity.

21. Design References, Execution Rules, and Phase Control
A. Design References
Use these existing reference files as the visual baseline:
docs/design-references/platform-dashboard.html
docs/design-references/platform-editor.html
Inspect both reference files before implementing the relevant designs.
Use them to understand the intended layout, styling, spacing, component organization, and visual direction.
Improve on the references rather than simply copying them.
Ensure the final design is coherent across all pages.
Do not assume the reference files contain functioning business logic.
B. Dependencies
Reuse existing charting libraries, UI components, utility libraries, and styling tools wherever practical.
Add a new dependency only when clearly justified.
Avoid duplicating functionality already available in the codebase.
Prefer clean, reusable components over unnecessarily complex abstractions.
C. Work One Phase at a Time
This is a strict execution requirement.
Follow the implementation phases in Section 15.
For each phase:
Review the requirements for that phase.
Inspect the relevant existing code and design references.
Implement the changes for that phase only.
Preserve existing functionality.
Run the production build.
Run lint.
Run type checks.
Run relevant automated tests where available.
Fix errors introduced by the phase.
Review the resulting implementation for consistency and regressions.
Commit the completed phase.
Push the commit to the appropriate existing Git branch.
Stop and summarize what was completed.
Use descriptive commit messages following this format:
Redesign phase N: <brief description>
Examples:
Redesign phase 1: design system and navigation
Redesign phase 2: overview and sites
Redesign phase 3: clients domains and forms
Redesign phase 4: analytics AI costs and settings
Redesign phase 5: dashboard polish and validation
Redesign phase 6: website editor interface
Redesign phase 7: authentication onboarding and client portal
Do not combine multiple phases into one large commit.
Do not automatically continue into the next phase.
After completing and pushing each phase, STOP and wait for my review and instruction to proceed.
If validation fails, do not claim the phase is complete or push a broken implementation. Explain the blocker and what remains unresolved.
Do not force-push or overwrite unrelated work.
Respect the existing repository branch strategy and deployment configuration.
D. Required Phase Order
The required order is:
Phase 1: Design foundation and global navigation.
Phase 2: Overview and Sites.
Phase 3: Clients, Domain Requests, and Forms.
Phase 4: Analytics, AI Costs, and Settings.
Phase 5: Dashboard polish, accessibility, responsiveness, and validation.
Phase 6: Website Editor redesign.
Phase 7: Authentication, onboarding, wizards, error pages, and client-user dashboard.
The Editor redesign is specifically Phase 6 and must take place after Phase 5.
E. Post-Phase Summary
After each completed phase, provide a clear summary of:
What changed.
Files or components modified.
Improvements made to the user experience.
Functionality preserved.
Build results.
Lint results.
Type-check results.
Test results.
Any new dependencies.
Any unresolved issues.
Git commit hash.
Git push status.
What the next phase will address.
Do not begin the next phase until I explicitly authorize it.

Final Product Vision
SitoMax should feel like a premium digital platform that brings website creation, editing, hosting, domain management, client management, analytics, forms, and AI capabilities into one beautiful, unified experience.
The agency dashboard should be powerful and efficient.
The client dashboard should be simple, professional, and trustworthy.
The website editor should feel sophisticated, intuitive, and polished.
Every interaction should reinforce the quality of the SitoMax brand.
Do not settle for a basic administrative dashboard or generic template styling.
Aim for a modern, elegant, thoughtfully engineered SaaS experience that can confidently compete in the website builder and digital agency platform market.
Begin with Phase 1 only. Complete it, validate it, commit it, push it, summarize the results, and STOP.
