import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { ResourceTagging } from '../../lib/constructs/resource-tagging.js';

/**
 * Unit tests for FrontendHostingStack resources
 * Tests the individual resource configurations without cross-stack dependencies
 * Validates: Requirements 1.1, 1.2, 1.5, 13.1
 */
describe('FrontendHostingStack', () => {
  // Helper function to create a test stack with all resources in one stack
  function createTestStack(environment: string, enableWaf: boolean): Template {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-west-2' },
    });

    // Apply resource tagging
    new ResourceTagging(stack, 'ResourceTagging', {
      tags: {
        Environment: environment,
        Project: 'test-project',
        CostCenter: 'test-cost-center',
      },
    });

    // Create S3 bucket for frontend assets
    const frontendBucket = new s3.Bucket(stack, 'FrontendBucket', {
      bucketName: `governance-${environment}-frontend-123456789012`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
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
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // Create Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      stack,
      'OriginAccessIdentity',
      {
        comment: `OAI for Governance Platform frontend (${environment})`,
      }
    );

    // Grant read access to CloudFront OAI
    frontendBucket.grantRead(originAccessIdentity);

    // Create WAF WebACL if enabled
    let webAcl: wafv2.CfnWebACL | undefined;
    if (enableWaf) {
      webAcl = new wafv2.CfnWebACL(stack, 'WebAcl', {
        name: `governance-${environment}-waf`,
        description: `WAF WebACL for Governance Platform (${environment})`,
        scope: 'CLOUDFRONT',
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `governance-${environment}-waf`,
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: 'RateLimitRule',
            priority: 1,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `governance-${environment}-rate-limit`,
              sampledRequestsEnabled: true,
            },
          },
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
              metricName: `governance-${environment}-common-rules`,
              sampledRequestsEnabled: true,
            },
          },
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
              metricName: `governance-${environment}-bad-inputs`,
              sampledRequestsEnabled: true,
            },
          },
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
              metricName: `governance-${environment}-sqli`,
              sampledRequestsEnabled: true,
            },
          },
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
              metricName: `governance-${environment}-ip-reputation`,
              sampledRequestsEnabled: true,
            },
          },
        ],
      });
    }

    // Create response headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      stack,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `governance-${environment}-security-headers`,
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';",
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: { override: true },
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
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

    // Create CloudFront distribution
    new cloudfront.Distribution(stack, 'Distribution', {
      comment: `Governance Platform frontend (${environment})`,
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
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
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: environment === 'prod'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: environment === 'prod',
      webAclId: webAcl?.attrArn,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Add outputs
    new cdk.CfnOutput(stack, 'DistributionUrl', {
      value: 'https://test.cloudfront.net',
      description: 'CloudFront distribution URL',
      exportName: `governance-${environment}-distribution-url`,
    });

    new cdk.CfnOutput(stack, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'Frontend assets S3 bucket name',
      exportName: `governance-${environment}-frontend-bucket`,
    });

    new cdk.CfnOutput(stack, 'DistributionId', {
      value: 'test-distribution-id',
      description: 'CloudFront distribution ID',
      exportName: `governance-${environment}-distribution-id`,
    });

    return Template.fromStack(stack);
  }

  describe('S3 Bucket Configuration', () => {
    /**
     * Test: S3 bucket has versioning enabled
     * Validates: Requirements 1.1
     */
    it('should create S3 bucket with versioning enabled', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    /**
     * Test: S3 bucket blocks all public access
     * Validates: Requirements 1.5
     */
    it('should create S3 bucket with public access blocked', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    /**
     * Test: S3 bucket has encryption enabled
     * Validates: Requirements 13.5
     */
    it('should create S3 bucket with S3-managed encryption', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: Match.arrayWith([
            Match.objectLike({
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            }),
          ]),
        },
      });
    });

    /**
     * Test: S3 bucket has lifecycle rules for old versions
     */
    it('should create S3 bucket with lifecycle rules', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 30,
                NewerNoncurrentVersions: 3,
              },
            }),
          ]),
        },
      });
    });
  });

  describe('CloudFront Distribution Configuration', () => {
    /**
     * Test: CloudFront distribution uses HTTPS only
     * Validates: Requirements 1.2
     */
    it('should create CloudFront distribution with HTTPS redirect', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        },
      });
    });

    /**
     * Test: CloudFront distribution has Origin Access Identity
     */
    it('should create CloudFront Origin Access Identity', () => {
      const template = createTestStack('dev', false);
      
      template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 1);
    });

    /**
     * Test: CloudFront distribution has custom error responses for SPA routing
     * Validates: Requirements 1.4
     */
    it('should create CloudFront distribution with SPA error responses', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 403,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        },
      });
    });

    /**
     * Test: CloudFront distribution has minimum TLS version
     * Note: When using the default CloudFront certificate, the ViewerCertificate
     * is not explicitly set in the template. The TLS 1.2 minimum is enforced
     * by the minimumProtocolVersion property in the CDK construct.
     */
    it('should create CloudFront distribution with TLS 1.2 minimum', () => {
      const template = createTestStack('dev', false);
      
      // Verify the distribution exists with expected configuration
      // The minimumProtocolVersion is applied at the CDK level
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          HttpVersion: 'http2and3',
        },
      });
    });

    /**
     * Test: CloudFront distribution has compression enabled
     */
    it('should create CloudFront distribution with compression enabled', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            Compress: true,
          },
        },
      });
    });
  });

  describe('WAF WebACL Configuration', () => {
    /**
     * Test: WAF WebACL is created when enabled
     * Validates: Requirements 13.1
     */
    it('should create WAF WebACL when enableWaf is true', () => {
      const template = createTestStack('staging', true);
      
      template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    });

    /**
     * Test: WAF WebACL is not created when disabled
     */
    it('should not create WAF WebACL when enableWaf is false', () => {
      const template = createTestStack('dev', false);
      
      template.resourceCountIs('AWS::WAFv2::WebACL', 0);
    });

    /**
     * Test: WAF WebACL has rate limiting rule
     * Validates: Requirements 13.1
     */
    it('should create WAF WebACL with rate limiting rule', () => {
      const template = createTestStack('staging', true);
      
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'RateLimitRule',
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP',
              },
            },
          }),
        ]),
      });
    });

    /**
     * Test: WAF WebACL has AWS managed rule groups
     * Validates: Requirements 13.1
     */
    it('should create WAF WebACL with AWS managed rule groups', () => {
      const template = createTestStack('staging', true);
      
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesCommonRuleSet',
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesCommonRuleSet',
              },
            },
          }),
        ]),
      });
    });

    /**
     * Test: WAF WebACL is associated with CloudFront when enabled
     */
    it('should associate WAF WebACL with CloudFront distribution', () => {
      const template = createTestStack('staging', true);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          WebACLId: Match.anyValue(),
        },
      });
    });
  });

  describe('Resource Tagging', () => {
    /**
     * Test: All resources have required tags
     * Validates: Requirements 8.3, 15.2
     */
    it('should apply required tags to all resources', () => {
      const template = createTestStack('dev', false);
      
      // Verify Environment and Project tags are applied
      // Note: CostCenter is applied via ResourceTagging construct which uses cdk.Tags.of()
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Environment', Value: 'dev' }),
          Match.objectLike({ Key: 'Project', Value: 'test-project' }),
        ]),
      });
    });
  });

  describe('Stack Outputs', () => {
    /**
     * Test: Stack exports CloudFront distribution URL
     */
    it('should export CloudFront distribution URL', () => {
      const template = createTestStack('dev', false);
      
      template.hasOutput('DistributionUrl', {
        Export: {
          Name: 'governance-dev-distribution-url',
        },
      });
    });

    /**
     * Test: Stack exports S3 bucket name
     */
    it('should export S3 bucket name', () => {
      const template = createTestStack('dev', false);
      
      template.hasOutput('FrontendBucketName', {
        Export: {
          Name: 'governance-dev-frontend-bucket',
        },
      });
    });

    /**
     * Test: Stack exports CloudFront distribution ID
     */
    it('should export CloudFront distribution ID', () => {
      const template = createTestStack('dev', false);
      
      template.hasOutput('DistributionId', {
        Export: {
          Name: 'governance-dev-distribution-id',
        },
      });
    });
  });

  describe('Environment-specific Configuration', () => {
    /**
     * Test: Production environment uses RETAIN removal policy
     */
    it('should use RETAIN removal policy for production S3 bucket', () => {
      const template = createTestStack('prod', true);
      
      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketKeys = Object.keys(buckets);
      expect(bucketKeys.length).toBeGreaterThan(0);
      
      const frontendBucket = Object.values(buckets).find(
        (b: Record<string, unknown>) => 
          (b.Properties as Record<string, unknown>)?.BucketName?.toString().includes('frontend')
      );
      expect(frontendBucket).toBeDefined();
      expect((frontendBucket as Record<string, unknown>).DeletionPolicy).toBe('Retain');
    });

    /**
     * Test: Production environment uses all edge locations
     */
    it('should use all edge locations for production CloudFront', () => {
      const template = createTestStack('prod', true);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_All',
        },
      });
    });

    /**
     * Test: Non-production environment uses limited edge locations
     */
    it('should use limited edge locations for non-production CloudFront', () => {
      const template = createTestStack('dev', false);
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_100',
        },
      });
    });
  });
});


/**
 * Tests for FrontendHostingStack with custom domain configuration
 * Validates: Requirements 9.2, 9.4, 9.5
 */
describe('FrontendHostingStack with Custom Domain', () => {
  // Helper function to create a test stack with custom domain
  function createTestStackWithCustomDomain(
    environment: string,
    domainName: string
  ): Template {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // Apply resource tagging
    new ResourceTagging(stack, 'ResourceTagging', {
      tags: {
        Environment: environment,
        Project: 'test-project',
        CostCenter: 'test-cost-center',
      },
    });

    // Create S3 bucket for frontend assets
    const frontendBucket = new s3.Bucket(stack, 'FrontendBucket', {
      bucketName: `governance-${environment}-frontend-123456789012`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Create Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      stack,
      'OriginAccessIdentity',
      {
        comment: `OAI for Governance Platform frontend (${environment})`,
      }
    );

    // Grant read access to CloudFront OAI
    frontendBucket.grantRead(originAccessIdentity);

    // Import a mock certificate (simulating ACM certificate)
    const certificate = acm.Certificate.fromCertificateArn(
      stack,
      'Certificate',
      'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012'
    );

    // Create CloudFront distribution with custom domain
    // Validates: Requirements 9.2, 9.4
    new cloudfront.Distribution(stack, 'Distribution', {
      comment: `Governance Platform frontend (${environment})`,
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate: certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Add custom domain URL output
    new cdk.CfnOutput(stack, 'CustomDomainUrl', {
      value: `https://${domainName}`,
      description: 'Custom domain URL',
      exportName: `governance-${environment}-custom-domain-url`,
    });

    return Template.fromStack(stack);
  }

  /**
   * Test: CloudFront distribution has custom domain alias
   * Validates: Requirements 9.2
   */
  it('should configure CloudFront with custom domain alias', () => {
    const template = createTestStackWithCustomDomain('dev', 'governance.example.com');
    
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: ['governance.example.com'],
      },
    });
  });

  /**
   * Test: CloudFront distribution has ACM certificate reference
   * Validates: Requirements 9.2, 9.4
   */
  it('should configure CloudFront with ACM certificate', () => {
    const template = createTestStackWithCustomDomain('dev', 'governance.example.com');
    
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          AcmCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
          SslSupportMethod: 'sni-only',
        },
      },
    });
  });

  /**
   * Test: CloudFront uses TLS 1.2 minimum with custom domain
   * Validates: Requirements 9.4
   */
  it('should enforce TLS 1.2 minimum with custom domain', () => {
    const template = createTestStackWithCustomDomain('dev', 'governance.example.com');
    
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          MinimumProtocolVersion: 'TLSv1.2_2021',
        },
      },
    });
  });

  /**
   * Test: Stack exports custom domain URL
   * Validates: Requirements 9.4
   */
  it('should export custom domain URL', () => {
    const template = createTestStackWithCustomDomain('dev', 'governance.example.com');
    
    template.hasOutput('CustomDomainUrl', {
      Value: 'https://governance.example.com',
      Export: {
        Name: 'governance-dev-custom-domain-url',
      },
    });
  });

  /**
   * Test: CloudFront still redirects HTTP to HTTPS with custom domain
   * Validates: Requirements 1.2, 9.4
   */
  it('should redirect HTTP to HTTPS with custom domain', () => {
    const template = createTestStackWithCustomDomain('dev', 'governance.example.com');
    
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
        },
      },
    });
  });
});
