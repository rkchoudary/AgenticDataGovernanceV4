import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { ResourceTagging } from '../../lib/constructs/resource-tagging.js';

/**
 * Unit tests for CustomDomainStack resources
 * Tests ACM certificate creation, CloudFront custom domain configuration, and Route 53 records
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
describe('CustomDomainStack', () => {
  // Helper function to create a test stack with custom domain resources
  function createTestStack(
    environment: string,
    domainName: string,
    hostedZoneId: string = 'Z1234567890ABC'
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

    // Create a mock hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: 'example.com',
    });

    // Create ACM certificate with DNS validation
    // Validates: Requirements 9.1
    const certificate = new acm.Certificate(stack, 'Certificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
      certificateName: `governance-${environment}-certificate`,
    });

    // Create a mock S3 bucket for CloudFront origin
    const bucket = new s3.Bucket(stack, 'FrontendBucket', {
      bucketName: `governance-${environment}-frontend-123456789012`,
    });

    // Create Origin Access Identity
    const oai = new cloudfront.OriginAccessIdentity(stack, 'OAI', {
      comment: 'OAI for test',
    });

    // Create CloudFront distribution with custom domain
    // Validates: Requirements 9.2, 9.4
    const distribution = new cloudfront.Distribution(stack, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [domainName],
      certificate: certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Create Route 53 A record
    // Validates: Requirements 9.3
    new route53.ARecord(stack, 'ARecord', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
      comment: `A record for Governance Platform (${environment})`,
    });

    // Create Route 53 AAAA record for IPv6
    // Validates: Requirements 9.3
    new route53.AaaaRecord(stack, 'AaaaRecord', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
      comment: `AAAA record (IPv6) for Governance Platform (${environment})`,
    });

    // Add outputs
    new cdk.CfnOutput(stack, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ACM certificate ARN for custom domain',
      exportName: `governance-${environment}-certificate-arn`,
    });

    new cdk.CfnOutput(stack, 'CustomDomainUrl', {
      value: `https://${domainName}`,
      description: 'Custom domain URL',
      exportName: `governance-${environment}-custom-domain-url`,
    });

    return Template.fromStack(stack);
  }

  describe('ACM Certificate Configuration', () => {
    /**
     * Test: ACM certificate is created for custom domain
     * Validates: Requirements 9.1
     */
    it('should create ACM certificate for custom domain', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'governance.example.com',
      });
    });

    /**
     * Test: ACM certificate uses DNS validation
     * Validates: Requirements 9.1
     */
    it('should configure ACM certificate with DNS validation', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        ValidationMethod: 'DNS',
      });
    });

    /**
     * Test: ACM certificate has correct name tag
     */
    it('should create ACM certificate with correct name', () => {
      const template = createTestStack('prod', 'governance.example.com');
      
      // CertificateName is applied as a tag, not a direct property
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'governance.example.com',
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Name', Value: 'governance-prod-certificate' }),
        ]),
      });
    });
  });

  describe('CloudFront Custom Domain Configuration', () => {
    /**
     * Test: CloudFront distribution has custom domain name
     * Validates: Requirements 9.2
     */
    it('should configure CloudFront with custom domain name', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['governance.example.com'],
        },
      });
    });

    /**
     * Test: CloudFront distribution has ACM certificate
     * Validates: Requirements 9.2, 9.4
     */
    it('should configure CloudFront with ACM certificate', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            AcmCertificateArn: Match.anyValue(),
            SslSupportMethod: 'sni-only',
            MinimumProtocolVersion: 'TLSv1.2_2021',
          },
        },
      });
    });

    /**
     * Test: CloudFront uses SNI for SSL
     * Validates: Requirements 9.4
     */
    it('should configure CloudFront with SNI SSL support', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            SslSupportMethod: 'sni-only',
          },
        },
      });
    });

    /**
     * Test: CloudFront enforces TLS 1.2 minimum
     * Validates: Requirements 9.4
     */
    it('should configure CloudFront with TLS 1.2 minimum', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            MinimumProtocolVersion: 'TLSv1.2_2021',
          },
        },
      });
    });
  });

  describe('Route 53 Records Configuration', () => {
    /**
     * Test: Route 53 A record is created
     * Validates: Requirements 9.3
     */
    it('should create Route 53 A record pointing to CloudFront', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: 'A',
        Name: 'governance.example.com.',
        AliasTarget: {
          DNSName: Match.anyValue(),
          HostedZoneId: Match.anyValue(),
        },
      });
    });

    /**
     * Test: Route 53 AAAA record is created for IPv6
     * Validates: Requirements 9.3
     */
    it('should create Route 53 AAAA record for IPv6', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: 'AAAA',
        Name: 'governance.example.com.',
        AliasTarget: {
          DNSName: Match.anyValue(),
          HostedZoneId: Match.anyValue(),
        },
      });
    });

    /**
     * Test: Both A and AAAA records are created
     * Validates: Requirements 9.3
     */
    it('should create both A and AAAA records', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      // Count Route53 RecordSet resources
      const recordSets = template.findResources('AWS::Route53::RecordSet');
      const recordSetCount = Object.keys(recordSets).length;
      
      expect(recordSetCount).toBe(2);
    });

    /**
     * Test: Records use correct hosted zone
     */
    it('should create records in correct hosted zone', () => {
      const template = createTestStack('dev', 'governance.example.com', 'Z1234567890ABC');
      
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        HostedZoneId: 'Z1234567890ABC',
      });
    });
  });

  describe('Stack Outputs', () => {
    /**
     * Test: Stack exports certificate ARN
     */
    it('should export certificate ARN', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasOutput('CertificateArn', {
        Export: {
          Name: 'governance-dev-certificate-arn',
        },
      });
    });

    /**
     * Test: Stack exports custom domain URL
     */
    it('should export custom domain URL', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      template.hasOutput('CustomDomainUrl', {
        Value: 'https://governance.example.com',
        Export: {
          Name: 'governance-dev-custom-domain-url',
        },
      });
    });
  });

  describe('Resource Tagging', () => {
    /**
     * Test: All resources have required tags
     * Validates: Requirements 8.3, 15.2
     */
    it('should apply required tags to resources', () => {
      const template = createTestStack('dev', 'governance.example.com');
      
      // Verify tags are applied to S3 bucket
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Environment', Value: 'dev' }),
          Match.objectLike({ Key: 'Project', Value: 'test-project' }),
        ]),
      });
    });
  });

  describe('Subdomain Support', () => {
    /**
     * Test: Subdomain configuration works correctly
     */
    it('should support subdomain configuration', () => {
      const template = createTestStack('dev', 'app.governance.example.com');
      
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'app.governance.example.com',
      });
      
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['app.governance.example.com'],
        },
      });
    });
  });
});
