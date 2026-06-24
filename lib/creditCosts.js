// Credits charged per generation for pay-as-you-go users (Pro/Business = unlimited).
// 1 = short/standard, 2 = medium documents, 3 = long-form / legal

const CREDIT_COSTS = {
  // 1 credit — emails, short copy, standard letters
  'cold-email': 1,
  'follow-up-email': 1,
  'ad-copy': 1,
  'email-subject-lines': 1,
  'social-captions': 1,
  'bio-twitter': 1,
  'brand-tagline': 1,
  'elevator-pitch': 1,
  'apology-email': 1,
  'interview-thank-you': 1,
  'reference-request': 1,
  'job-offer-negotiation': 1,
  'testimonial-request': 1,
  'partnership-pitch': 1,
  'investor-email': 1,
  'customer-onboarding': 1,
  'support-response': 1,
  'churn-win-back': 1,
  'review-response': 1,
  'fundraising-appeal': 1,
  'farewell-message': 1,
  'thank-you-note': 1,
  'cover-letter': 1,
  'resignation-letter': 1,
  'complaint-letter': 1,
  'newsletter': 1,
  'property-listing': 1,
  'rental-listing': 1,
  'airbnb-description': 1,

  // 2 credits — tailored docs, proposals, richer content
  'resume-summary': 2,
  'linkedin-bio': 2,
  'sales-proposal': 2,
  'recommendation-letter': 2,
  'personal-bio': 2,
  'product-description': 2,
  'job-posting': 2,
  'press-release': 2,
  'blog-post-outline': 2,
  'landing-page-copy': 2,

  // 3 credits — long-form / legal
  'startup-one-pager': 3,
  'terms-conditions': 3,
  'privacy-policy': 3,
  'wedding-speech': 3,
};

const DEFAULT_CREDIT_COST = 1;

function getCreditCost(toolId) {
  return CREDIT_COSTS[toolId] ?? DEFAULT_CREDIT_COST;
}

module.exports = { CREDIT_COSTS, DEFAULT_CREDIT_COST, getCreditCost };