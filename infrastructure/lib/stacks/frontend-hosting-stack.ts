import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the FrontendHostingStack
 */
export interface FrontendHostingStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * Whether to enable WAF protection
   */
  enableWaf: boolean;

  /**
   * Custom domain name (optional)
   * Validates: Requirements 9.2, 9.4, 9.5
   */
  domainName?: string;

  /**
   * ACM certificate for custom domain (required if domainName is provided)
   * Must be in us-east-1 for CloudFront
   * Validates: Requirements 9.2
   */
  certificate?: acm.ICertificate;
}

/**
 * Frontend Hosting Stack for the Governance Platform
 *
 * Creates:
 * - S3 bucket for frontend assets (Requirements 1.1, 1.5)
 * - CloudFront distribution with HTTPS-only access (Requirements 1.2, 1.4)
 * - WAF WebACL for CloudFront protection (Requirements 13.1)
 */
export class FrontendHostingStack extends cdk.Stack {
  /**
   * S3 bucket for frontend assets
   */
  public readonly frontendBucket: s3.Bucket;

  /**
   * CloudFront distribution
   */
  public readonly distribution: cloudfront.Distribution;

  /**
   * WAF WebACL (if enabled)
   */
  public readonly webAcl?: wafv2.CfnWebACL;

  /**
   * Origin Access Identity for S3
   */
  public readonly originAccessIdentity: cloudfront.OriginAccessIdentity;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: FrontendHostingStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create S3 bucket for frontend assets
    // Validates: Requirements 1.1, 1.5
    this.frontendBucket = this.createFrontendBucket(props);

    // Create Origin Access Identity for CloudFront
    this.originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OriginAccessIdentity',
      {
        comment: `OAI for Governance Platform frontend (${props.environment})`,
      }
    );

    // Grant read access to CloudFront OAI
    this.frontendBucket.grantRead(this.originAccessIdentity);

    // Create WAF WebACL if enabled
    // Validates: Requirements 13.1
    if (props.enableWaf) {
      this.webAcl = this.createWafWebAcl(props);
    }

    // Create CloudFront distribution
    // Validates: Requirements 1.2, 1.4
    this.distribution = this.createCloudFrontDistribution(props);

    // Output the CloudFront distribution URL
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: `governance-${props.environment}-distribution-url`,
    });

    // Output the custom domain URL if configured
    // Validates: Requirements 9.4
    if (props.domainName) {
      new cdk.CfnOutput(this, 'CustomDomainUrl', {
        value: `https://${props.domainName}`,
        description: 'Custom domain URL',
        exportName: `governance-${props.environment}-custom-domain-url`,
      });
    }

    // Output the S3 bucket name
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'Frontend assets S3 bucket name',
      exportName: `governance-${props.environment}-frontend-bucket`,
    });

    // Output the CloudFront distribution ID
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `governance-${props.environment}-distribution-id`,
    });
  }


  /**
   * Creates the S3 bucket for frontend assets
   * Validates: Requirements 1.1, 1.5
   */
  private createFrontendBucket(props: FrontendHostingStackProps): s3.Bucket {
    return new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `governance-${props.environment}-frontend-${this.account}`,
      
      // Enable versioning for rollback capability
      // Validates: Requirements 1.1
      versioned: true,
      
      // Enable server-side encryption with S3-managed keys
      // Using S3_MANAGED to avoid cross-stack KMS key dependencies
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Block all public access - CloudFront only
      // Validates: Requirements 1.5
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Enforce SSL for all requests
      enforceSSL: true,
      
      // Set removal policy based on environment
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      
      // Auto-delete objects in non-prod environments
      autoDeleteObjects: props.environment !== 'prod',
      
      // Lifecycle rules for old versions
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
          noncurrentVersionsToRetain: 3,
        },
        {
          id: 'AbortIncompleteMultipartUploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      
      // Enable object ownership for bucket owner
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });
  }


  /**
   * Creates the CloudFront distribution
   * Validates: Requirements 1.2, 1.4, 9.2, 9.4
   */
  private createCloudFrontDistribution(
    props: FrontendHostingStackProps
  ): cloudfront.Distribution {
    // Create response headers policy for security
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `governance-${props.environment}-security-headers`,
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com wss://*.amazonaws.com;",
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: {
            override: true,
          },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

    // Build distribution configuration
    const distributionProps: cloudfront.DistributionProps = {
      comment: `Governance Platform frontend (${props.environment})`,
      
      // Default behavior for S3 origin
      defaultBehavior: {
        origin: new origins.S3Origin(this.frontendBucket, {
          originAccessIdentity: this.originAccessIdentity,
        }),
        
        // HTTPS only - redirect HTTP to HTTPS
        // Validates: Requirements 1.2
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        
        // Allowed HTTP methods
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        
        // Enable compression
        compress: true,
        
        // Cache policy for static assets
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        
        // Response headers policy
        responseHeadersPolicy,
      },
      
      // Default root object
      defaultRootObject: 'index.html',
      
      // Custom error responses for SPA routing
      // Validates: Requirements 1.4
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      
      // Enable HTTP/2 and HTTP/3
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      
      // Price class - use all edge locations for prod
      priceClass: props.environment === 'prod'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      
      // Enable logging in prod
      enableLogging: props.environment === 'prod',
      
      // Associate WAF WebACL if enabled
      webAclId: this.webAcl?.attrArn,
      
      // Minimum TLS version
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    };

    // Add custom domain configuration if provided
    // Validates: Requirements 9.2, 9.4
    if (props.domainName && props.certificate) {
      Object.assign(distributionProps, {
        domainNames: [props.domainName],
        certificate: props.certificate,
      });
    }

    // Create the distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', distributionProps);

    return distribution;
  }


  /**
   * Creates the WAF WebACL for CloudFront protection
   * Validates: Requirements 13.1
   */
  private createWafWebAcl(props: FrontendHostingStackProps): wafv2.CfnWebACL {
    return new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `governance-${props.environment}-waf`,
      description: `WAF WebACL for Governance Platform (${props.environment})`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `governance-${props.environment}-waf`,
        sampledRequestsEnabled: true,
      },
      
      rules: [
        // Rate limiting rule
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000, // requests per 5 minutes per IP
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `governance-${props.environment}-rate-limit`,
            sampledRequestsEnabled: true,
          },
        },
        
        // AWS Managed Rules - Common Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `governance-${props.environment}-common-rules`,
            sampledRequestsEnabled: true,
          },
        },
        
        // AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `governance-${props.environment}-bad-inputs`,
            sampledRequestsEnabled: true,
          },
        },
        
        // AWS Managed Rules - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `governance-${props.environment}-sqli`,
            sampledRequestsEnabled: true,
          },
        },
        
        // AWS Managed Rules - Amazon IP Reputation List
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 5,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `governance-${props.environment}-ip-reputation`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
  }
}
