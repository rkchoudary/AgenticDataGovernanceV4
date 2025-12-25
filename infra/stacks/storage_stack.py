"""Storage stack for S3 and caching infrastructure."""

from aws_cdk import (
    Stack,
    RemovalPolicy,
    Duration,
    aws_s3 as s3,
    aws_elasticache as elasticache,
    aws_ec2 as ec2,
)
from constructs import Construct


class StorageStack(Stack):
    """Stack for storage infrastructure including S3 and Redis cache."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # S3 bucket for document storage
        self.document_bucket = s3.Bucket(
            self,
            "DocumentBucket",
            bucket_name=f"regulatory-kb-documents-{self.account}",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
            lifecycle_rules=[
                s3.LifecycleRule(
                    id="ArchiveOldVersions",
                    noncurrent_version_transitions=[
                        s3.NoncurrentVersionTransition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(90),
                        )
                    ],
                )
            ],
        )

        # VPC for ElastiCache (FalkorDB runs on Redis)
        self.vpc = ec2.Vpc(
            self,
            "RegulatoryKBVpc",
            max_azs=2,
            nat_gateways=1,
        )

        # Security group for Redis/FalkorDB
        self.redis_security_group = ec2.SecurityGroup(
            self,
            "RedisSecurityGroup",
            vpc=self.vpc,
            description="Security group for Redis/FalkorDB",
            allow_all_outbound=True,
        )

        self.redis_security_group.add_ingress_rule(
            peer=ec2.Peer.ipv4(self.vpc.vpc_cidr_block),
            connection=ec2.Port.tcp(6379),
            description="Allow Redis connections from VPC",
        )

        # ElastiCache subnet group
        private_subnets = [subnet.subnet_id for subnet in self.vpc.private_subnets]
        self.cache_subnet_group = elasticache.CfnSubnetGroup(
            self,
            "CacheSubnetGroup",
            description="Subnet group for regulatory KB cache",
            subnet_ids=private_subnets,
            cache_subnet_group_name="regulatory-kb-cache-subnet",
        )

        # ElastiCache Redis cluster for caching
        self.redis_cluster = elasticache.CfnCacheCluster(
            self,
            "RedisCluster",
            cache_node_type="cache.t3.medium",
            engine="redis",
            num_cache_nodes=1,
            cache_subnet_group_name=self.cache_subnet_group.cache_subnet_group_name,
            vpc_security_group_ids=[self.redis_security_group.security_group_id],
            cluster_name="regulatory-kb-cache",
        )

        self.redis_cluster.add_dependency(self.cache_subnet_group)
