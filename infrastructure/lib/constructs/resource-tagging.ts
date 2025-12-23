import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ResourceTags, validateRequiredTags } from '../config/environment.js';

/**
 * Properties for the ResourceTagging construct
 */
export interface ResourceTaggingProps {
  /**
   * Required tags to apply to all resources
   */
  tags: ResourceTags;
}

/**
 * Construct that applies required tags to all resources in a scope
 * 
 * **Feature: private-aws-deployment, Property 8: Resource Tagging Completeness**
 * For any AWS resource created by the CDK stack, the resource SHALL have 
 * environment, project, and cost-center tags.
 * 
 * Validates: Requirements 8.3, 15.2
 */
export class ResourceTagging extends Construct {
  public readonly tags: ResourceTags;

  constructor(scope: Construct, id: string, props: ResourceTaggingProps) {
    super(scope, id);

    // Validate that all required tags are present
    if (!validateRequiredTags(props.tags)) {
      throw new Error(
        'Missing required tags. All resources must have Environment, Project, and CostCenter tags.'
      );
    }

    this.tags = props.tags;

    // Apply tags to all resources in the scope
    this.applyTags(scope);
  }

  /**
   * Applies all tags to the given scope
   */
  private applyTags(scope: IConstruct): void {
    for (const [key, value] of Object.entries(this.tags)) {
      cdk.Tags.of(scope).add(key, value);
    }
  }

  /**
   * Returns the tags as a record for use in other constructs
   */
  public getTagsAsRecord(): Record<string, string> {
    return { ...this.tags };
  }
}

/**
 * Utility function to check if a construct has all required tags
 * Used for testing and validation
 */
export function hasRequiredTags(tags: Record<string, string>): boolean {
  const requiredTags = ['Environment', 'Project', 'CostCenter'];
  return requiredTags.every(tag => 
    tag in tags && 
    typeof tags[tag] === 'string' && 
    tags[tag].length > 0
  );
}

/**
 * Gets the list of required tag names
 */
export function getRequiredTagNames(): string[] {
  return ['Environment', 'Project', 'CostCenter'];
}
