// Scheme seed data.
// Only verified facts should be added to eligibility rules.
// Empty arrays / null values mean the requirement has not been recorded yet.

module.exports = [
    {
        name: "PM-KISAN",
        slug: "pm-kisan",
        description:
            "Provides income support of Rs 6,000 per year in three equal installments to eligible landholding farmer families, subject to the scheme guidelines and exclusion criteria.",
        category: "Agriculture",

        benefits: [
            "Income support of Rs 6,000 per year in three equal installments."
        ],

        eligibility: [
            {
                field: "occupation",
                operator: "eq",
                value: "farmer",
                description: "PM-KISAN targets landholding farmer families."
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
            "Register as a farmer using the portal's farmer registration page.",
            "Enter your land and bank account details exactly as in your land and bank records.",
            "Check your registration and payment status on the official portal."
        ],

        deadline: null,

        officialSource: "https://pmkisan.gov.in/",

        lastVerified: null,

        verificationStatus: "unverified",

        isActive: true
    },

    {
        name: "Ayushman Bharat PM-JAY",
        slug: "ayushman-bharat-pm-jay",
        description:
            "A government health assurance scheme providing health coverage to eligible beneficiary families under the PM-JAY framework.",

        category: "Healthcare",

        benefits: [],

        eligibility: [],

        requiredDocuments: [
            "Ration card or beneficiary identification as verified on the official PM-JAY portal",
            "Government-issued photo ID (do not enter ID numbers in this app)"
        ],

        applicationSteps: [
            "Check beneficiary eligibility through the official PM-JAY/Ayushman Bharat system."
        ],

        deadline: null,

        officialSource: "https://pmjay.gov.in/",

        lastVerified: null,

        verificationStatus: "unverified",

        isActive: true
    },

    {
        name: "UP Scholarship",
        slug: "up-scholarship",
        description:
            "Scholarship and fee reimbursement support for eligible students through the Uttar Pradesh scholarship and fee reimbursement system.",

        category: "Education",

        benefits: [],

        eligibility: [
            {
                field: "state",
                operator: "eq",
                value: "Uttar Pradesh",
                description: "This scheme is for Uttar Pradesh residents."
            },
            {
                field: "educationLevel",
                operator: "eq",
                value: "graduate",
                description: "This scheme is for graduate-level students, per the rule recorded for this scheme."
            }
        ],

        requiredDocuments: [
            "Mark sheets of previous examinations",
            "Bank account passbook",
            "Income certificate",
            "Caste certificate (if applicable)"
        ],

        applicationSteps: [
            "Open the official portal at https://scholarship.up.gov.in/.",
            "Register or log in on the official portal.",
            "Fill in your personal, education and bank details there.",
            "Upload the required documents as listed on the portal.",
            "Income criteria must be confirmed on the official portal; this app does not check them."
        ],

        deadline: null,

        officialSource: "https://scholarship.up.gov.in/",

        lastVerified: null,

        verificationStatus: "unverified",

        isActive: true
    }
];