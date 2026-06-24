function getPlanFeatures(plan) {
  const base = {
    unlimitedGenerations: false,
    allTemplates: true,
    priorityProcessing: false,
    outputHistory: false,
    tonePresetLimit: 0,
    exportTxt: false,
    exportDocx: false,
    teamSeats: 0,
    bulkGeneration: false,
    apiAccess: false,
    prioritySupport: false,
    customTemplates: false,
    maxOutputTokens: parseInt(process.env.FREE_MAX_OUTPUT_TOKENS || '800', 10),
    label: 'Free',
  };

  if (plan === 'pro') {
    return {
      ...base,
      unlimitedGenerations: true,
      priorityProcessing: true,
      outputHistory: true,
      tonePresetLimit: 5,
      exportTxt: true,
      exportDocx: true,
      maxOutputTokens: parseInt(process.env.PRO_MAX_OUTPUT_TOKENS || '2048', 10),
      label: 'Pro',
    };
  }

  if (plan === 'business') {
    return {
      ...base,
      unlimitedGenerations: true,
      priorityProcessing: true,
      outputHistory: true,
      tonePresetLimit: -1,
      exportTxt: true,
      exportDocx: true,
      teamSeats: 5,
      bulkGeneration: true,
      apiAccess: true,
      prioritySupport: true,
      maxOutputTokens: parseInt(process.env.BUSINESS_MAX_OUTPUT_TOKENS || '4096', 10),
      label: 'Business',
    };
  }

  if (plan === 'anonymous') {
    return { ...base, label: 'Guest' };
  }

  return base;
}

function hasFeature(plan, feature) {
  return !!getPlanFeatures(plan)[feature];
}

module.exports = { getPlanFeatures, hasFeature };