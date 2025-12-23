import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the CustomDomainStack
 */
export interface CustomDomainStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * Custom domain name (e.g., 'governance.example.com')
   */
  domainName: string;

  /**
   * Route 53 hosted zone ID (optional - if not provided, will look up by domain)
   */
  hostedZoneId?: string;

  /**
   * CloudFront distribution to associate with the custom domain
   */
  distribution: cloudfront.IDistribution;
}

/**
 * Custom Domain Stack for the Governance Platform
 *
 * Creates:
 * - ACM certificate with DNS validation (Requirements 9.1)
 * - Route 53 A and AAAA records pointing to CloudFront (Requirements 9.3)
 * 
 * Note: CloudFront configuration with custom domain is handled by updating
 * the FrontendHostingStack with the certificate ARN.
 */
export class CustomDomainStack extends cdk.Stack {
  /**
   * ACM certificate for the custom domain
   */
  public readonly certificate: acm.ICertificate;

  /**
   * Route 53 hosted zone
   */
  public readonly hostedZone: route53.IHostedZone;

  /**
   * A record pointing to CloudFront
   */
  public readonly aRecord: route53.ARecord;

  /**
   * AAAA record for IPv6 pointing to CloudFront
   */
  public readonly aaaaRecord: route53.AaaaRecord;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: CustomDomainStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Look up or import the hosted zone
    this.hostedZone = this.getHostedZone(props);

    // Create ACM certificate with DNS validation
    // Validates: Requirements 9.1
    this.certificate = this.createCertificate(props);

    // Create Route 53 A record pointing to CloudFront
    // Validates: Requirements 9.3
    this.aRecord = this.createARecord(props);

    // Create Route 53 AAAA record for IPv6
    // Validates: Requirements 9.3
    this.aaaaRecord = this.createAaaaRecord(props);

    // Output the certificate ARN
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM certificate ARN for custom domain',
      exportName: `governance-${props.environment}-certificate-arn`,
    });

    // Output the custom domain URL
    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://${props.domainName}`,
      description: 'Custom domain URL',
      exportName: `governance-${props.environment}-custom-domain-url`,
    });

    // Output the hosted zone ID
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route 53 hosted zone ID',
      exportName: `governance-${props.environment}-hosted-zone-id`,
    });
  }

  /**
   * Gets or looks up the Route 53 hosted zone
   */
  private getHostedZone(props: CustomDomainStackProps): route53.IHostedZone {
    // Extract the root domain from the full domain name
    // e.g., 'governance.example.com' -> 'example.com'
    const domainParts = props.domainName.split('.');
    const rootDomain = domainParts.slice(-2).join('.');

    if (props.hostedZoneId) {
      // Import existing hosted zone by ID
      return route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: rootDomain,
      });
    }

    // Look up hosted zone by domain name
    return route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: rootDomain,
    });
  }

  /**
   * Creates the ACM certificate with DNS validation
   * Validates: Requirements 9.1
   */
  private createCertificate(props: CustomDomainStackProps): acm.ICertificate {
    // For CloudFront, certificates must be in us-east-1
    // If we're not in us-east-1, we need to use a cross-region reference
    // or create the certificate in us-east-1
    
    // Create certificate with DNS validation
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      // Also include www subdomain if this is a root domain
      subjectAlternativeNames: this.getSubjectAlternativeNames(props.domainName),
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
      certificateName: `governance-${props.environment}-certificate`,
    });

    return certificate;
  }

  /**
   * Gets subject alternative names for the certificate
   */
  private getSubjectAlternativeNames(domainName: string): string[] | undefined {
    // If this is a subdomain (e.g., governance.example.com), no SANs needed
    const parts = domainName.split('.');
    if (parts.length > 2) {
      return undefined;
    }
    
    // For root domains, include www subdomain
    return [`www.${domainName}`];
  }

  /**
   * Creates the Route 53 A record pointing to CloudFront
   * Validates: Requirements 9.3
   */
  private createARecord(props: CustomDomainStackProps): route53.ARecord {
    return new route53.ARecord(this, 'ARecord', {
      zone: this.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(props.distribution as cloudfront.Distribution)
      ),
      comment: `A record for Governance Platform (${props.environment})`,
    });
  }

  /**
   * Creates the Route 53 AAAA record for IPv6 pointing to CloudFront
   * Validates: Requirements 9.3
   */
  private createAaaaRecord(props: CustomDomainStackProps): route53.AaaaRecord {
    return new route53.AaaaRecord(this, 'AaaaRecord', {
      zone: this.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(props.distribution as cloudfront.Distribution)
      ),
      comment: `AAAA record (IPv6) for Governance Platform (${props.environment})`,
    });
  }
}

/**
 * Helper function to create a certificate in us-east-1 for CloudFront
 * This is needed when the main stack is deployed in a different region
 */
export function createCloudFrontCertificate(
  scope: Construct,
  id: string,
  props: {
    domainName: string;
    hostedZone: route53.IHostedZone;
    environment: string;
  }
): acm.ICertificate {
  // Create certificate with DNS validation
  return new acm.Certificate(scope, id, {
    domainName: props.domainName,
    validation: acm.CertificateValidation.fromDns(props.hostedZone),
    certificateName: `governance-${props.environment}-cloudfront-certificate`,
  });
}
