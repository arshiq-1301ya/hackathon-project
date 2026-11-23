{
    name: "PM-KISAN",
    slug: "pm-kisan",
    description:
        "Provides income support of Rs 6,000 per year in three equal installments to eligible landholding farmer families, subject to scheme guidelines and exclusion criteria.",
    category: "Agriculture",

    benefits: [
        "Income support of Rs 6,000 per year in three equal installments."
    ],

    eligibility: [
        {
            field: "occupation",
            operator: "eq",
            value: "farmer",
            description: "PM-KISAN targets eligible landholding farmer families."
        },
        {
            field: "landStatus",
            operator: "eq",
            value: "landholding",
            description: "The applicant must own cultivable land."
        }
    ],

    requiredDocuments: [
        "Land ownership records (khasra/khatauni or equivalent)",
        "Bank account passbook with IFSC code",
        "Government-issued photo ID (do not enter ID numbers in this app)",
        "Mobile number linked to bank account"
    ],

    applicationSteps: [
        "Open the official PM-KISAN portal at https://pmkisan.gov.in/.",
        "Register as a farmer using the official farmer registration facility.",
        "Enter land and bank account details as required on the official portal.",
        "Check registration and payment status on the official portal."
    ],

    deadline: null,

    officialSource: "https://pmkisan.gov.in/",
    officialApplicationUrl: "https://pmkisan.gov.in/",

    lastVerified: null,
    verificationStatus: "unverified",

    isActive: true
},