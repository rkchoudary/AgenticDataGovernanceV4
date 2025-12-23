/**
 * Regulatory Knowledge Base Service
 * Provides comprehensive regulatory report information for the AI Assistant
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 12.1-12.7
 */

import {
  RegulatoryReportKB,
  RegulatoryQuery,
  RegulatoryQueryResult,
  ReportSchedule,
  RegulatoryChangeNotification,
  ReportCategory
} from '../types/regulatory-knowledge-base.js';
import { Jurisdiction } from '../types/common.js';

/**
 * US Federal Reserve Reports
 * Requirements: 12.1
 */
export const US_FEDERAL_RESERVE_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'ccar',
    name: 'Comprehensive Capital Analysis and Review',
    shortName: 'CCAR',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Annual exercise to assess whether the largest bank holding companies have sufficient capital to continue operations during times of economic and financial stress.',
    purpose: 'Evaluate capital adequacy, internal capital planning processes, and planned capital distributions such as dividend payments and share repurchases.',
    regulatoryBasis: 'Dodd-Frank Act Section 165(i), 12 CFR 225.8',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: 'April 5th annually (or next business day)'
    },
    submissionFormat: 'XML/XBRL',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Tier 1 Capital',
      'Common Equity Tier 1',
      'Risk-Weighted Assets',
      'Leverage Ratio',
      'Stress Test Scenarios',
      'Capital Distribution Plans'
    ],
    category: 'capital_stress_testing',
    applicability: 'Bank holding companies with $100 billion or more in total consolidated assets',
    relatedReports: ['dfast', 'fr-y-14a', 'fr-y-14q'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/ccar.htm'
  },
  {
    id: 'dfast',
    name: 'Dodd-Frank Act Stress Test',
    shortName: 'DFAST',
    regulator: 'FRB',
    additionalRegulators: ['OCC', 'FDIC'],
    jurisdiction: 'US',
    description: 'Forward-looking quantitative evaluation of the impact of stressful economic and financial market conditions on bank capital.',
    purpose: 'Assess whether institutions have sufficient capital to absorb losses and support operations during adverse economic conditions.',
    regulatoryBasis: 'Dodd-Frank Act Section 165(i)(2), 12 CFR 252 Subpart E',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: 'Results published by June 30th annually'
    },
    submissionFormat: 'XML/XBRL',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Pre-Provision Net Revenue',
      'Loan Losses',
      'Trading Losses',
      'Operational Risk Losses',
      'Capital Ratios Under Stress'
    ],
    category: 'capital_stress_testing',
    applicability: 'Bank holding companies with $250 billion or more in total consolidated assets',
    relatedReports: ['ccar', 'fr-y-14a'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/dfa-stress-tests.htm'
  },
  {
    id: 'fr-y-14a',
    name: 'Capital Assessments and Stress Testing - Annual',
    shortName: 'FR Y-14A',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Annual data collection supporting the Federal Reserve\'s supervisory stress testing and capital planning programs.',
    purpose: 'Collect detailed data on bank holding company characteristics and operations to support stress testing models.',
    regulatoryBasis: '12 CFR 252.17',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: 'January 5th annually'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Summary Schedule',
      'Macro Scenario',
      'Regulatory Capital Instruments',
      'Business Plan Changes',
      'Operational Risk'
    ],
    category: 'capital_stress_testing',
    applicability: 'Bank holding companies with $100 billion or more in total consolidated assets',
    relatedReports: ['fr-y-14q', 'fr-y-14m', 'ccar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDal8cbqnRxZRg=='
  },

  {
    id: 'fr-y-14q',
    name: 'Capital Assessments and Stress Testing - Quarterly',
    shortName: 'FR Y-14Q',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Quarterly data collection on bank holding company portfolios, capital components, and categories of pre-provision net revenue.',
    purpose: 'Provide granular data for ongoing monitoring and stress testing between annual submissions.',
    regulatoryBasis: '12 CFR 252.17',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 40,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: '40 calendar days after quarter end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Securities',
      'Retail Loans',
      'Wholesale Loans',
      'Trading',
      'Pre-Provision Net Revenue',
      'Regulatory Capital'
    ],
    category: 'capital_stress_testing',
    applicability: 'Bank holding companies with $100 billion or more in total consolidated assets',
    relatedReports: ['fr-y-14a', 'fr-y-14m'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDal8cbqnRxZRg=='
  },
  {
    id: 'fr-y-14m',
    name: 'Capital Assessments and Stress Testing - Monthly',
    shortName: 'FR Y-14M',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Monthly collection of detailed loan-level data on residential mortgages, home equity loans, and credit cards.',
    purpose: 'Support granular analysis of retail credit portfolios for stress testing and supervisory monitoring.',
    regulatoryBasis: '12 CFR 252.17',
    frequency: 'monthly',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '30 calendar days after month end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'First Lien Mortgages',
      'Home Equity Loans',
      'Home Equity Lines of Credit',
      'Credit Card Accounts',
      'Loan Performance Data'
    ],
    category: 'capital_stress_testing',
    applicability: 'Bank holding companies with $100 billion or more in total consolidated assets',
    relatedReports: ['fr-y-14a', 'fr-y-14q'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDal8cbqnRxZRg=='
  },
  {
    id: 'fr-y-9c',
    name: 'Consolidated Financial Statements for Holding Companies',
    shortName: 'FR Y-9C',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Primary financial report for bank holding companies, providing consolidated balance sheet and income statement data.',
    purpose: 'Monitor financial condition and performance of bank holding companies on a consolidated basis.',
    regulatoryBasis: '12 U.S.C. 1844(c), 12 CFR 225.5(b)',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 40,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '40 calendar days after quarter end'
    },
    submissionFormat: 'XML/XBRL',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Consolidated Balance Sheet',
      'Consolidated Income Statement',
      'Regulatory Capital',
      'Off-Balance Sheet Items',
      'Past Due and Nonaccrual Loans'
    ],
    category: 'financial_statements',
    applicability: 'Bank holding companies with $3 billion or more in total consolidated assets',
    relatedReports: ['fr-y-15', 'call-report'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDYS7jEHXS/g3Q=='
  },
  {
    id: 'fr-y-15',
    name: 'Systemic Risk Report',
    shortName: 'FR Y-15',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Report collecting systemic risk data from large bank holding companies to assess their systemic importance.',
    purpose: 'Identify and monitor systemically important financial institutions and assess potential systemic risks.',
    regulatoryBasis: 'Dodd-Frank Act Section 165, 12 CFR 217.404',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '45 calendar days after quarter end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Size Indicators',
      'Interconnectedness',
      'Substitutability',
      'Complexity',
      'Cross-Jurisdictional Activity'
    ],
    category: 'risk_management',
    applicability: 'Bank holding companies with $100 billion or more in total consolidated assets',
    relatedReports: ['fr-y-9c', 'living-will'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDYnbIw+hhwZhg=='
  },
  {
    id: 'fr-2052a',
    name: 'Complex Institution Liquidity Monitoring Report',
    shortName: 'FR 2052a',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Detailed liquidity data collection for monitoring liquidity risk at the largest financial institutions.',
    purpose: 'Monitor liquidity positions and funding profiles of systemically important institutions on a daily basis.',
    regulatoryBasis: '12 CFR 249, Enhanced Prudential Standards',
    frequency: 'daily',
    dueDate: {
      daysAfterPeriodEnd: 1,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: 'T+1 business day'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Intraday Liquidity',
      'Wholesale Funding',
      'Retail Funding',
      'Secured Funding',
      'Derivatives Collateral',
      'High Quality Liquid Assets'
    ],
    category: 'liquidity',
    applicability: 'Bank holding companies with $700 billion or more in total consolidated assets',
    relatedReports: ['lcr', 'nsfr'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/apps/reportforms/reportdetail.aspx?sOoYJ+5BzDYRxOuxFfkhqQ=='
  }
];


/**
 * US Liquidity and Resolution Reports
 * Requirements: 12.2, 12.3
 */
export const US_LIQUIDITY_RESOLUTION_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'lcr',
    name: 'Liquidity Coverage Ratio',
    shortName: 'LCR',
    regulator: 'FRB',
    additionalRegulators: ['OCC', 'FDIC'],
    jurisdiction: 'US',
    description: 'Measure of short-term liquidity requiring banks to hold sufficient high-quality liquid assets to cover net cash outflows over a 30-day stress period.',
    purpose: 'Ensure banks maintain adequate liquidity buffers to survive short-term liquidity stress scenarios.',
    regulatoryBasis: '12 CFR 249, Basel III Liquidity Framework',
    frequency: 'monthly',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '30 calendar days after month end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'High Quality Liquid Assets (HQLA)',
      'Level 1 Assets',
      'Level 2A Assets',
      'Level 2B Assets',
      'Total Net Cash Outflows',
      'LCR Ratio'
    ],
    category: 'liquidity',
    applicability: 'Banking organizations with $250 billion or more in total consolidated assets',
    relatedReports: ['nsfr', 'fr-2052a'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/basel/liquidity-coverage-ratio.htm'
  },
  {
    id: 'nsfr',
    name: 'Net Stable Funding Ratio',
    shortName: 'NSFR',
    regulator: 'FRB',
    additionalRegulators: ['OCC', 'FDIC'],
    jurisdiction: 'US',
    description: 'Measure of long-term liquidity requiring banks to maintain stable funding relative to the liquidity characteristics of their assets.',
    purpose: 'Promote resilience over a longer time horizon by requiring banks to fund activities with sufficiently stable sources.',
    regulatoryBasis: '12 CFR 249 Subpart K, Basel III Liquidity Framework',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '45 calendar days after quarter end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'Federal Reserve Reporting Central',
    dataElements: [
      'Available Stable Funding (ASF)',
      'Required Stable Funding (RSF)',
      'NSFR Ratio',
      'Retail Deposits',
      'Wholesale Funding',
      'Asset Encumbrance'
    ],
    category: 'liquidity',
    applicability: 'Banking organizations with $250 billion or more in total consolidated assets',
    relatedReports: ['lcr', 'fr-2052a'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/basel/net-stable-funding-ratio.htm'
  },
  {
    id: 'living-will',
    name: 'Resolution Plan (Living Will)',
    shortName: 'Living Will',
    regulator: 'FRB',
    additionalRegulators: ['FDIC'],
    jurisdiction: 'US',
    description: 'Strategic plan describing how a systemically important financial institution could be resolved under bankruptcy without causing systemic disruption.',
    purpose: 'Ensure orderly resolution of large financial institutions without taxpayer bailouts or systemic risk.',
    regulatoryBasis: 'Dodd-Frank Act Section 165(d), 12 CFR 243, 12 CFR 381',
    frequency: 'biennial',
    dueDate: {
      daysAfterPeriodEnd: 0,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: 'July 1st of submission year (alternating full and targeted plans)'
    },
    submissionFormat: 'PDF/Word',
    submissionPlatform: 'Secure File Transfer',
    dataElements: [
      'Executive Summary',
      'Strategic Analysis',
      'Corporate Governance',
      'Organizational Structure',
      'Management Information Systems',
      'Interconnections and Interdependencies',
      'Supervisory and Regulatory Information'
    ],
    category: 'resolution_planning',
    applicability: 'Bank holding companies with $250 billion or more in total consolidated assets',
    relatedReports: ['fr-y-15'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/resolution-plans.htm'
  },
  {
    id: 'sr-11-7',
    name: 'SR 11-7 Model Risk Management',
    shortName: 'SR 11-7',
    regulator: 'FRB',
    jurisdiction: 'US',
    description: 'Supervisory guidance on model risk management requiring comprehensive model inventory, validation, and governance.',
    purpose: 'Ensure banks have robust frameworks for managing risks associated with the use of quantitative models.',
    regulatoryBasis: 'SR Letter 11-7, OCC Bulletin 2011-12',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 90,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: 'Annual attestation, typically Q1'
    },
    submissionFormat: 'PDF',
    submissionPlatform: 'Examination Portal',
    dataElements: [
      'Model Inventory',
      'Model Validation Results',
      'Model Risk Ratings',
      'Model Governance Framework',
      'Model Performance Monitoring'
    ],
    category: 'risk_management',
    applicability: 'All banking organizations using quantitative models',
    relatedReports: ['bcbs-239'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.federalreserve.gov/supervisionreg/srletters/sr1107.htm'
  },
  {
    id: 'bcbs-239',
    name: 'BCBS 239 Risk Data Aggregation and Reporting',
    shortName: 'BCBS 239',
    regulator: 'FRB',
    additionalRegulators: ['OCC', 'FDIC'],
    jurisdiction: 'US',
    description: 'Principles for effective risk data aggregation and risk reporting to strengthen banks\' risk data capabilities.',
    purpose: 'Improve banks\' ability to aggregate risk data accurately and report risk information in a timely manner.',
    regulatoryBasis: 'Basel Committee BCBS 239, SR 14-1',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 60,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: 'Annual self-assessment, typically Q1'
    },
    submissionFormat: 'PDF',
    submissionPlatform: 'Examination Portal',
    dataElements: [
      'Data Governance',
      'Data Architecture',
      'IT Infrastructure',
      'Accuracy and Integrity',
      'Completeness',
      'Timeliness',
      'Adaptability'
    ],
    category: 'risk_management',
    applicability: 'Global systemically important banks (G-SIBs)',
    relatedReports: ['sr-11-7'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.bis.org/publ/bcbs239.htm'
  }
];


/**
 * US OCC/FDIC Reports
 * Requirements: 12.4
 */
export const US_OCC_FDIC_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'call-report',
    name: 'Consolidated Reports of Condition and Income (Call Report)',
    shortName: 'Call Report',
    regulator: 'FFIEC',
    additionalRegulators: ['OCC', 'FDIC', 'FRB'],
    jurisdiction: 'US',
    description: 'Quarterly report of a bank\'s financial condition and income, serving as the primary source of financial data for regulatory monitoring.',
    purpose: 'Provide regulators with financial data to assess bank safety and soundness, and support deposit insurance assessments.',
    regulatoryBasis: '12 U.S.C. 161, 12 U.S.C. 1817(a), FFIEC 031/041/051',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '30 calendar days after quarter end'
    },
    submissionFormat: 'XML/XBRL',
    submissionPlatform: 'FFIEC Central Data Repository',
    dataElements: [
      'Balance Sheet',
      'Income Statement',
      'Regulatory Capital',
      'Loans and Leases',
      'Deposits',
      'Off-Balance Sheet Items',
      'Past Due and Nonaccrual'
    ],
    category: 'financial_statements',
    applicability: 'All FDIC-insured depository institutions',
    relatedReports: ['fr-y-9c'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.ffiec.gov/ffiec_report_forms.htm'
  },
  {
    id: 'part-370',
    name: 'FDIC Part 370 Recordkeeping for Timely Deposit Insurance Determination',
    shortName: 'Part 370',
    regulator: 'FDIC',
    jurisdiction: 'US',
    description: 'Requirements for covered institutions to maintain complete and accurate data on depositors and their accounts for rapid deposit insurance determination.',
    purpose: 'Enable FDIC to make deposit insurance determinations within 24 hours of a bank failure.',
    regulatoryBasis: '12 CFR Part 370',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 0,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      specificDayOfMonth: 30,
      description: 'Annual certification by April 30th'
    },
    submissionFormat: 'PDF/XML',
    submissionPlatform: 'FDIC Connect',
    dataElements: [
      'Depositor Information',
      'Account Ownership Categories',
      'Deposit Insurance Coverage',
      'IT System Capabilities',
      'Data Quality Metrics'
    ],
    category: 'prudential',
    applicability: 'Covered institutions with 2 million or more deposit accounts',
    relatedReports: ['call-report'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fdic.gov/regulations/laws/rules/2000-5900.html'
  }
];

/**
 * US AML/BSA Reports
 * Requirements: 12.5
 */
export const US_AML_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'ctr',
    name: 'Currency Transaction Report',
    shortName: 'CTR',
    regulator: 'FinCEN',
    jurisdiction: 'US',
    description: 'Report filed for each cash transaction exceeding $10,000 conducted by or on behalf of a person.',
    purpose: 'Detect and prevent money laundering and other financial crimes through monitoring of large cash transactions.',
    regulatoryBasis: 'Bank Secrecy Act, 31 CFR 1010.311',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 15,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '15 calendar days after the transaction'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FinCEN BSA E-Filing System',
    dataElements: [
      'Transaction Amount',
      'Transaction Date',
      'Person Conducting Transaction',
      'Person on Whose Behalf Transaction Conducted',
      'Financial Institution Information'
    ],
    category: 'aml_compliance',
    applicability: 'All financial institutions subject to BSA',
    relatedReports: ['sar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fincen.gov/resources/filing-information'
  },
  {
    id: 'sar',
    name: 'Suspicious Activity Report',
    shortName: 'SAR',
    regulator: 'FinCEN',
    jurisdiction: 'US',
    description: 'Report filed when a financial institution detects known or suspected violations of law or suspicious activity.',
    purpose: 'Alert law enforcement to potential money laundering, terrorist financing, and other financial crimes.',
    regulatoryBasis: 'Bank Secrecy Act, 31 CFR 1020.320',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: false,
      timezone: 'America/New_York',
      description: '30 calendar days after initial detection (60 days if no suspect identified)'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FinCEN BSA E-Filing System',
    dataElements: [
      'Subject Information',
      'Suspicious Activity Information',
      'Financial Institution Information',
      'Narrative Description',
      'Supporting Documentation'
    ],
    category: 'aml_compliance',
    applicability: 'All financial institutions subject to BSA',
    relatedReports: ['ctr'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fincen.gov/resources/filing-information'
  },
  {
    id: 'ofac',
    name: 'OFAC Blocking and Reject Reports',
    shortName: 'OFAC Reports',
    regulator: 'Treasury',
    additionalRegulators: ['OFAC'],
    jurisdiction: 'US',
    description: 'Reports of blocked transactions and rejected transactions involving sanctioned parties.',
    purpose: 'Enforce economic sanctions by reporting blocked or rejected transactions involving sanctioned entities.',
    regulatoryBasis: 'International Emergency Economic Powers Act (IEEPA), 31 CFR 501',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 10,
      businessDaysOnly: true,
      timezone: 'America/New_York',
      description: '10 business days after blocking action'
    },
    submissionFormat: 'PDF/Online Form',
    submissionPlatform: 'OFAC Reporting System',
    dataElements: [
      'Blocked Property Information',
      'Sanctioned Party Details',
      'Transaction Details',
      'Blocking Institution Information',
      'Annual Report of Blocked Property'
    ],
    category: 'aml_compliance',
    applicability: 'All U.S. persons and financial institutions',
    relatedReports: ['sar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://ofac.treasury.gov/civil-penalties-and-enforcement/ofac-reporting-system'
  }
];


/**
 * Canadian OSFI Reports
 * Requirements: 12.6
 */
export const CANADIAN_OSFI_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'bcar',
    name: 'Basel Capital Adequacy Reporting',
    shortName: 'BCAR',
    regulator: 'OSFI',
    jurisdiction: 'CA',
    description: 'Comprehensive capital adequacy reporting under Basel III framework for Canadian deposit-taking institutions.',
    purpose: 'Monitor capital adequacy and ensure Canadian banks maintain sufficient capital buffers.',
    regulatoryBasis: 'OSFI Capital Adequacy Requirements (CAR) Guideline',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: '45 calendar days after quarter end'
    },
    submissionFormat: 'XML/XBRL',
    submissionPlatform: 'OSFI Regulatory Reporting System (RRS)',
    dataElements: [
      'Common Equity Tier 1 (CET1)',
      'Additional Tier 1 Capital',
      'Tier 2 Capital',
      'Risk-Weighted Assets',
      'Capital Ratios',
      'Leverage Ratio'
    ],
    category: 'capital_stress_testing',
    applicability: 'All federally regulated deposit-taking institutions',
    relatedReports: ['lrr', 'osfi-lcr'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/capital-adequacy-requirements-car-chapter-1-overview'
  },
  {
    id: 'lrr',
    name: 'Leverage Requirements Return',
    shortName: 'LRR',
    regulator: 'OSFI',
    jurisdiction: 'CA',
    description: 'Report on leverage ratio requirements measuring capital relative to total exposure.',
    purpose: 'Constrain excessive leverage and provide a backstop to risk-based capital requirements.',
    regulatoryBasis: 'OSFI Leverage Requirements Guideline',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 45,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: '45 calendar days after quarter end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'OSFI Regulatory Reporting System (RRS)',
    dataElements: [
      'Tier 1 Capital',
      'Total Exposure Measure',
      'On-Balance Sheet Exposures',
      'Derivative Exposures',
      'Securities Financing Transactions',
      'Off-Balance Sheet Items'
    ],
    category: 'capital_stress_testing',
    applicability: 'All federally regulated deposit-taking institutions',
    relatedReports: ['bcar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/leverage-requirements-guideline'
  },
  {
    id: 'osfi-lcr',
    name: 'Liquidity Coverage Ratio Return (Return LA)',
    shortName: 'LCR Return',
    regulator: 'OSFI',
    jurisdiction: 'CA',
    description: 'Canadian implementation of Basel III LCR requirements for short-term liquidity.',
    purpose: 'Ensure Canadian banks maintain adequate high-quality liquid assets to meet short-term obligations.',
    regulatoryBasis: 'OSFI Liquidity Adequacy Requirements (LAR) Guideline',
    frequency: 'monthly',
    dueDate: {
      daysAfterPeriodEnd: 15,
      businessDaysOnly: true,
      timezone: 'America/Toronto',
      description: '15 business days after month end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'OSFI Regulatory Reporting System (RRS)',
    dataElements: [
      'High Quality Liquid Assets',
      'Level 1 Assets',
      'Level 2 Assets',
      'Total Net Cash Outflows',
      'LCR Ratio'
    ],
    category: 'liquidity',
    applicability: 'Domestic systemically important banks (D-SIBs)',
    relatedReports: ['osfi-nsfr', 'bcar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/liquidity-adequacy-requirements-lar-guideline'
  },
  {
    id: 'osfi-nsfr',
    name: 'Net Stable Funding Ratio Return (Return DT1)',
    shortName: 'NSFR Return',
    regulator: 'OSFI',
    jurisdiction: 'CA',
    description: 'Canadian implementation of Basel III NSFR requirements for long-term funding stability.',
    purpose: 'Promote funding stability by requiring banks to maintain stable funding relative to asset liquidity.',
    regulatoryBasis: 'OSFI Liquidity Adequacy Requirements (LAR) Guideline',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: true,
      timezone: 'America/Toronto',
      description: '30 business days after quarter end'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'OSFI Regulatory Reporting System (RRS)',
    dataElements: [
      'Available Stable Funding',
      'Required Stable Funding',
      'NSFR Ratio',
      'Funding Sources by Category',
      'Asset Liquidity Classification'
    ],
    category: 'liquidity',
    applicability: 'Domestic systemically important banks (D-SIBs)',
    relatedReports: ['osfi-lcr', 'bcar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/liquidity-adequacy-requirements-lar-guideline'
  },
  {
    id: 'icaap',
    name: 'Internal Capital Adequacy Assessment Process',
    shortName: 'ICAAP',
    regulator: 'OSFI',
    jurisdiction: 'CA',
    description: 'Institution\'s own assessment of capital adequacy relative to its risk profile and business strategy.',
    purpose: 'Ensure institutions have robust internal processes for assessing capital needs beyond regulatory minimums.',
    regulatoryBasis: 'OSFI ICAAP Guideline E-19',
    frequency: 'annual',
    dueDate: {
      daysAfterPeriodEnd: 90,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: '90 calendar days after fiscal year end'
    },
    submissionFormat: 'PDF',
    submissionPlatform: 'OSFI Regulatory Reporting System (RRS)',
    dataElements: [
      'Risk Identification',
      'Risk Measurement',
      'Capital Planning',
      'Stress Testing Results',
      'Board Oversight Documentation'
    ],
    category: 'capital_stress_testing',
    applicability: 'All federally regulated deposit-taking institutions',
    relatedReports: ['bcar'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/internal-capital-adequacy-assessment-process-icaap'
  }
];

/**
 * Canadian FINTRAC Reports
 * Requirements: 12.7
 */
export const CANADIAN_FINTRAC_REPORTS: RegulatoryReportKB[] = [
  {
    id: 'lctr',
    name: 'Large Cash Transaction Report',
    shortName: 'LCTR',
    regulator: 'FINTRAC',
    jurisdiction: 'CA',
    description: 'Report filed for cash transactions of $10,000 CAD or more.',
    purpose: 'Detect and deter money laundering through monitoring of large cash transactions.',
    regulatoryBasis: 'Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA)',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 15,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: '15 calendar days after the transaction'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FINTRAC Web Reporting System',
    dataElements: [
      'Transaction Amount',
      'Transaction Date',
      'Conductor Information',
      'Account Holder Information',
      'Reporting Entity Information'
    ],
    category: 'aml_compliance',
    applicability: 'All reporting entities under PCMLTFA',
    relatedReports: ['str'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fintrac-canafe.gc.ca/reporting-declaration/lctr-eng'
  },
  {
    id: 'eftr',
    name: 'Electronic Funds Transfer Report',
    shortName: 'EFTR',
    regulator: 'FINTRAC',
    jurisdiction: 'CA',
    description: 'Report filed for international electronic funds transfers of $10,000 CAD or more.',
    purpose: 'Monitor cross-border fund movements to detect money laundering and terrorist financing.',
    regulatoryBasis: 'Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA)',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 5,
      businessDaysOnly: true,
      timezone: 'America/Toronto',
      description: '5 business days after the transfer'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FINTRAC Web Reporting System',
    dataElements: [
      'Transfer Amount',
      'Originator Information',
      'Beneficiary Information',
      'Ordering Institution',
      'Beneficiary Institution'
    ],
    category: 'aml_compliance',
    applicability: 'All reporting entities under PCMLTFA',
    relatedReports: ['lctr', 'str'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fintrac-canafe.gc.ca/reporting-declaration/eftr-eng'
  },
  {
    id: 'str',
    name: 'Suspicious Transaction Report',
    shortName: 'STR',
    regulator: 'FINTRAC',
    jurisdiction: 'CA',
    description: 'Report filed when there are reasonable grounds to suspect a transaction is related to money laundering or terrorist financing.',
    purpose: 'Alert authorities to potential money laundering, terrorist financing, and other financial crimes.',
    regulatoryBasis: 'Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA)',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 30,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: '30 calendar days after detection'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FINTRAC Web Reporting System',
    dataElements: [
      'Subject Information',
      'Transaction Details',
      'Indicators of Suspicion',
      'Narrative Description',
      'Action Taken'
    ],
    category: 'aml_compliance',
    applicability: 'All reporting entities under PCMLTFA',
    relatedReports: ['lctr', 'eftr'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fintrac-canafe.gc.ca/reporting-declaration/str-eng'
  },
  {
    id: 'tpr',
    name: 'Terrorist Property Report',
    shortName: 'TPR',
    regulator: 'FINTRAC',
    jurisdiction: 'CA',
    description: 'Report filed when property owned or controlled by a terrorist or terrorist group is discovered.',
    purpose: 'Support counter-terrorism efforts by identifying and freezing terrorist assets.',
    regulatoryBasis: 'Criminal Code of Canada, PCMLTFA',
    frequency: 'event-driven',
    dueDate: {
      daysAfterPeriodEnd: 0,
      businessDaysOnly: false,
      timezone: 'America/Toronto',
      description: 'Immediately upon discovery'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FINTRAC Web Reporting System',
    dataElements: [
      'Property Description',
      'Listed Person/Entity Information',
      'Discovery Circumstances',
      'Reporting Entity Information',
      'Actions Taken'
    ],
    category: 'aml_compliance',
    applicability: 'All persons in Canada',
    relatedReports: ['str'],
    lastUpdated: new Date('2024-01-15'),
    referenceUrl: 'https://www.fintrac-canafe.gc.ca/reporting-declaration/tpr-eng'
  }
];


/**
 * Combined regulatory reports from all jurisdictions
 */
export const ALL_REGULATORY_REPORTS: RegulatoryReportKB[] = [
  ...US_FEDERAL_RESERVE_REPORTS,
  ...US_LIQUIDITY_RESOLUTION_REPORTS,
  ...US_OCC_FDIC_REPORTS,
  ...US_AML_REPORTS,
  ...CANADIAN_OSFI_REPORTS,
  ...CANADIAN_FINTRAC_REPORTS
];

/**
 * Regulatory Knowledge Base Service
 * Provides query handlers for regulatory report information
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export class RegulatoryKnowledgeBaseService {
  private reports: Map<string, RegulatoryReportKB>;
  private changeNotifications: RegulatoryChangeNotification[] = [];

  constructor() {
    this.reports = new Map();
    ALL_REGULATORY_REPORTS.forEach(report => {
      this.reports.set(report.id, report);
    });
  }

  /**
   * Get all reports
   */
  getAllReports(): RegulatoryReportKB[] {
    return Array.from(this.reports.values());
  }

  /**
   * Get a report by ID
   * Requirements: 5.1
   */
  getReportById(reportId: string): RegulatoryReportKB | undefined {
    return this.reports.get(reportId.toLowerCase());
  }

  /**
   * Search reports by name or short name
   * Requirements: 5.1
   */
  searchReports(query: string): RegulatoryReportKB[] {
    const normalizedQuery = query.toLowerCase();
    return Array.from(this.reports.values()).filter(report =>
      report.name.toLowerCase().includes(normalizedQuery) ||
      report.shortName.toLowerCase().includes(normalizedQuery) ||
      report.id.toLowerCase().includes(normalizedQuery) ||
      report.description.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * Get reports by jurisdiction
   */
  getReportsByJurisdiction(jurisdiction: Jurisdiction): RegulatoryReportKB[] {
    return Array.from(this.reports.values()).filter(
      report => report.jurisdiction === jurisdiction
    );
  }

  /**
   * Get reports by regulator
   */
  getReportsByRegulator(regulator: string): RegulatoryReportKB[] {
    const normalizedRegulator = regulator.toUpperCase();
    return Array.from(this.reports.values()).filter(
      report => 
        report.regulator.toUpperCase() === normalizedRegulator ||
        report.additionalRegulators?.some(r => r.toUpperCase() === normalizedRegulator)
    );
  }

  /**
   * Get reports by category
   */
  getReportsByCategory(category: ReportCategory): RegulatoryReportKB[] {
    return Array.from(this.reports.values()).filter(
      report => report.category === category
    );
  }

  /**
   * Get reports by frequency
   */
  getReportsByFrequency(frequency: string): RegulatoryReportKB[] {
    return Array.from(this.reports.values()).filter(
      report => report.frequency === frequency
    );
  }

  /**
   * Get report definition with full details
   * Requirements: 5.1
   */
  getReportDefinition(reportId: string): RegulatoryQueryResult {
    const report = this.getReportById(reportId);
    
    if (!report) {
      return {
        query: { type: 'definition', reportId },
        reports: [],
        summary: `No report found with ID "${reportId}". Please check the report name or try searching.`,
        timestamp: new Date()
      };
    }

    const summary = this.formatReportDefinition(report);
    
    return {
      query: { type: 'definition', reportId },
      reports: [report],
      summary,
      relatedInfo: report.relatedReports?.map(id => {
        const related = this.getReportById(id);
        return related ? `${related.shortName}: ${related.name}` : id;
      }),
      timestamp: new Date()
    };
  }

  /**
   * Format a report definition as a readable summary
   */
  private formatReportDefinition(report: RegulatoryReportKB): string {
    return `**${report.shortName} - ${report.name}**

**Regulator:** ${report.regulator}${report.additionalRegulators ? ` (also ${report.additionalRegulators.join(', ')})` : ''}
**Jurisdiction:** ${report.jurisdiction === 'US' ? 'United States' : 'Canada'}

**Description:** ${report.description}

**Purpose:** ${report.purpose}

**Regulatory Basis:** ${report.regulatoryBasis}

**Filing Frequency:** ${this.formatFrequency(report.frequency)}
**Due Date:** ${report.dueDate.description || `${report.dueDate.daysAfterPeriodEnd} ${report.dueDate.businessDaysOnly ? 'business' : 'calendar'} days after period end`}

**Submission Format:** ${report.submissionFormat}
**Submission Platform:** ${report.submissionPlatform}

**Key Data Elements:**
${report.dataElements.map(el => `• ${el}`).join('\n')}

**Applicability:** ${report.applicability || 'See regulatory guidance'}`;
  }

  /**
   * Format frequency for display
   */
  private formatFrequency(frequency: string): string {
    const frequencyMap: Record<string, string> = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'monthly': 'Monthly',
      'quarterly': 'Quarterly',
      'annual': 'Annual',
      'biennial': 'Biennial (every 2 years)',
      'event-driven': 'Event-driven (as needed)',
      'ad-hoc': 'Ad-hoc'
    };
    return frequencyMap[frequency] || frequency;
  }

  /**
   * Get report schedule and deadlines
   * Requirements: 5.2
   */
  getReportSchedule(reportId: string, referenceDate?: Date): ReportSchedule | null {
    const report = this.getReportById(reportId);
    if (!report) return null;

    const now = referenceDate || new Date();
    const nextDueDate = this.calculateNextDueDate(report, now);
    const submissionWindow = this.calculateSubmissionWindow(report, nextDueDate);
    const daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      reportId: report.id,
      reportName: report.name,
      frequency: this.formatFrequency(report.frequency),
      nextDueDate,
      submissionWindow,
      daysUntilDue,
      isOverdue: daysUntilDue < 0
    };
  }

  /**
   * Calculate the next due date for a report
   */
  private calculateNextDueDate(report: RegulatoryReportKB, referenceDate: Date): Date {
    const now = new Date(referenceDate);
    let periodEnd: Date;

    switch (report.frequency) {
      case 'daily':
        periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() - 1);
        break;
      case 'weekly':
        periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() - periodEnd.getDay());
        break;
      case 'monthly':
        periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        periodEnd = new Date(now.getFullYear(), quarter * 3, 0);
        break;
      case 'annual':
      case 'biennial':
        periodEnd = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        // Event-driven reports don't have a fixed schedule
        return new Date(now);
    }

    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + report.dueDate.daysAfterPeriodEnd);

    // If the calculated due date is in the past, move to next period
    if (dueDate < now) {
      return this.calculateNextDueDate(report, new Date(dueDate.getTime() + 24 * 60 * 60 * 1000));
    }

    return dueDate;
  }

  /**
   * Calculate submission window for a report
   */
  private calculateSubmissionWindow(report: RegulatoryReportKB, dueDate: Date): { start: Date; end: Date } {
    const windowStart = new Date(dueDate);
    
    // Submission window typically opens 5-10 days before due date
    switch (report.frequency) {
      case 'daily':
        windowStart.setDate(windowStart.getDate() - 1);
        break;
      case 'weekly':
        windowStart.setDate(windowStart.getDate() - 3);
        break;
      case 'monthly':
        windowStart.setDate(windowStart.getDate() - 10);
        break;
      case 'quarterly':
      case 'annual':
      case 'biennial':
        windowStart.setDate(windowStart.getDate() - 15);
        break;
      default:
        windowStart.setDate(windowStart.getDate() - 5);
    }

    return {
      start: windowStart,
      end: dueDate
    };
  }

  /**
   * Get upcoming deadlines across all reports
   * Requirements: 5.2
   */
  getUpcomingDeadlines(
    daysAhead: number = 30,
    jurisdiction?: Jurisdiction
  ): ReportSchedule[] {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + daysAhead);

    let reports = Array.from(this.reports.values());
    
    if (jurisdiction) {
      reports = reports.filter(r => r.jurisdiction === jurisdiction);
    }

    // Filter out event-driven reports
    reports = reports.filter(r => 
      r.frequency !== 'event-driven' && r.frequency !== 'ad-hoc'
    );

    const schedules = reports
      .map(report => this.getReportSchedule(report.id, now))
      .filter((schedule): schedule is ReportSchedule => 
        schedule !== null && schedule.nextDueDate <= cutoff
      )
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());

    return schedules;
  }

  /**
   * Query regulatory changes
   * Requirements: 5.4
   */
  getRecentChanges(
    since?: Date,
    jurisdiction?: Jurisdiction
  ): RegulatoryChangeNotification[] {
    let changes = [...this.changeNotifications];
    
    if (since) {
      changes = changes.filter(c => c.announcedDate >= since);
    }
    
    if (jurisdiction) {
      changes = changes.filter(c => {
        const report = this.getReportById(c.reportId);
        return report?.jurisdiction === jurisdiction;
      });
    }

    return changes.sort((a, b) => b.announcedDate.getTime() - a.announcedDate.getTime());
  }

  /**
   * Add a regulatory change notification
   */
  addChangeNotification(change: RegulatoryChangeNotification): void {
    this.changeNotifications.push(change);
  }

  /**
   * Execute a regulatory query
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  executeQuery(query: RegulatoryQuery): RegulatoryQueryResult {
    let reports: RegulatoryReportKB[] = [];
    let summary = '';
    let relatedInfo: string[] = [];

    switch (query.type) {
      case 'definition':
        if (query.reportId) {
          return this.getReportDefinition(query.reportId);
        }
        reports = this.getAllReports();
        summary = `Found ${reports.length} regulatory reports in the knowledge base.`;
        break;

      case 'schedule':
        if (query.reportId) {
          const schedule = this.getReportSchedule(query.reportId);
          if (schedule) {
            const report = this.getReportById(query.reportId);
            reports = report ? [report] : [];
            summary = `**${schedule.reportName}**\n\n` +
              `Filing Frequency: ${schedule.frequency}\n` +
              `Next Due Date: ${schedule.nextDueDate.toLocaleDateString()}\n` +
              `Days Until Due: ${schedule.daysUntilDue}\n` +
              `Status: ${schedule.isOverdue ? '⚠️ OVERDUE' : '✓ On Track'}`;
          } else {
            summary = `No schedule found for report "${query.reportId}".`;
          }
        } else {
          const schedules = this.getUpcomingDeadlines(30, query.jurisdiction);
          reports = schedules.map(s => this.getReportById(s.reportId)!).filter(Boolean);
          summary = `**Upcoming Deadlines (Next 30 Days)**\n\n` +
            schedules.map(s => 
              `• ${s.reportName}: ${s.nextDueDate.toLocaleDateString()} (${s.daysUntilDue} days)`
            ).join('\n');
        }
        break;

      case 'data_sources':
        if (query.reportId) {
          const report = this.getReportById(query.reportId);
          if (report) {
            reports = [report];
            summary = `**Data Elements for ${report.shortName}**\n\n` +
              report.dataElements.map(el => `• ${el}`).join('\n');
            relatedInfo = [`Submission Format: ${report.submissionFormat}`, 
                          `Platform: ${report.submissionPlatform}`];
          } else {
            summary = `No report found with ID "${query.reportId}".`;
          }
        }
        break;

      case 'changes':
        const changes = this.getRecentChanges(query.dateRange?.start, query.jurisdiction);
        if (changes.length > 0) {
          summary = `**Recent Regulatory Changes**\n\n` +
            changes.map(c => 
              `• **${c.title}** (${c.changeType})\n  ${c.description}\n  Effective: ${c.effectiveDate.toLocaleDateString()}`
            ).join('\n\n');
          relatedInfo = changes.map(c => c.reportId);
        } else {
          summary = 'No recent regulatory changes found.';
        }
        break;

      case 'comparison':
        // Compare reports by category or jurisdiction
        if (query.category) {
          reports = this.getReportsByCategory(query.category);
          summary = `**${query.category.replace(/_/g, ' ').toUpperCase()} Reports**\n\n` +
            reports.map(r => `• ${r.shortName}: ${r.name} (${r.jurisdiction})`).join('\n');
        } else if (query.jurisdiction) {
          reports = this.getReportsByJurisdiction(query.jurisdiction);
          summary = `**${query.jurisdiction === 'US' ? 'US' : 'Canadian'} Regulatory Reports**\n\n` +
            reports.map(r => `• ${r.shortName}: ${r.name}`).join('\n');
        }
        break;
    }

    return {
      query,
      reports,
      summary,
      relatedInfo: relatedInfo.length > 0 ? relatedInfo : undefined,
      timestamp: new Date()
    };
  }

  /**
   * Natural language query handler
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  handleNaturalLanguageQuery(userQuery: string): RegulatoryQueryResult {
    const normalizedQuery = userQuery.toLowerCase();

    // Check for specific report queries
    const allReports = Array.from(this.reports.values());
    for (const report of allReports) {
      if (normalizedQuery.includes(report.shortName.toLowerCase()) ||
          normalizedQuery.includes(report.id.toLowerCase())) {
        
        // Determine query type based on keywords
        if (normalizedQuery.includes('deadline') || 
            normalizedQuery.includes('due') || 
            normalizedQuery.includes('schedule') ||
            normalizedQuery.includes('when')) {
          return this.executeQuery({ type: 'schedule', reportId: report.id });
        }
        
        if (normalizedQuery.includes('data') || 
            normalizedQuery.includes('element') || 
            normalizedQuery.includes('field') ||
            normalizedQuery.includes('source')) {
          return this.executeQuery({ type: 'data_sources', reportId: report.id });
        }
        
        // Default to definition
        return this.getReportDefinition(report.id);
      }
    }

    // Check for category queries
    if (normalizedQuery.includes('stress test') || normalizedQuery.includes('capital')) {
      return this.executeQuery({ type: 'comparison', category: 'capital_stress_testing' });
    }
    if (normalizedQuery.includes('liquidity')) {
      return this.executeQuery({ type: 'comparison', category: 'liquidity' });
    }
    if (normalizedQuery.includes('aml') || normalizedQuery.includes('anti-money') || 
        normalizedQuery.includes('suspicious') || normalizedQuery.includes('cash transaction')) {
      return this.executeQuery({ type: 'comparison', category: 'aml_compliance' });
    }
    if (normalizedQuery.includes('resolution') || normalizedQuery.includes('living will')) {
      return this.executeQuery({ type: 'comparison', category: 'resolution_planning' });
    }

    // Check for jurisdiction queries
    if (normalizedQuery.includes('canadian') || normalizedQuery.includes('osfi') || 
        normalizedQuery.includes('fintrac') || normalizedQuery.includes('canada')) {
      return this.executeQuery({ type: 'comparison', jurisdiction: 'CA' });
    }
    if (normalizedQuery.includes('us ') || normalizedQuery.includes('american') || 
        normalizedQuery.includes('federal reserve') || normalizedQuery.includes('frb') ||
        normalizedQuery.includes('occ') || normalizedQuery.includes('fdic') ||
        normalizedQuery.includes('fincen')) {
      return this.executeQuery({ type: 'comparison', jurisdiction: 'US' });
    }

    // Check for deadline queries
    if (normalizedQuery.includes('upcoming') || normalizedQuery.includes('deadline') ||
        normalizedQuery.includes('due soon')) {
      return this.executeQuery({ type: 'schedule' });
    }

    // Check for change queries
    if (normalizedQuery.includes('change') || normalizedQuery.includes('update') ||
        normalizedQuery.includes('new requirement')) {
      return this.executeQuery({ type: 'changes' });
    }

    // Default: search for matching reports
    const searchResults = this.searchReports(userQuery);
    if (searchResults.length > 0) {
      return {
        query: { type: 'definition' },
        reports: searchResults,
        summary: `Found ${searchResults.length} report(s) matching "${userQuery}":\n\n` +
          searchResults.map(r => `• **${r.shortName}**: ${r.name}`).join('\n'),
        timestamp: new Date()
      };
    }

    return {
      query: { type: 'definition' },
      reports: [],
      summary: `I couldn't find specific information about "${userQuery}". ` +
        `Try asking about specific reports like CCAR, FR Y-14M, LCR, or categories like "liquidity reports" or "Canadian regulatory reports".`,
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const regulatoryKnowledgeBase = new RegulatoryKnowledgeBaseService();
