"""
Role-based Access Control Manager
Provides utilities for managing user roles and permissions
"""

from typing import List, Dict, Any
from fastapi import HTTPException, status
from models import User, UserRole

class RoleManager:
    """
    Centralized role management and permission checking
    """
    
    # Define role hierarchy (higher number = more permissions)
    ROLE_HIERARCHY = {
        UserRole.CANDIDATE: 1,
        UserRole.RECRUITER: 2,
        UserRole.DOMAIN_EXPERT: 3,
        UserRole.ADMIN: 4
    }
    
    # Define role permissions
    ROLE_PERMISSIONS = {
        UserRole.CANDIDATE: [
            "apply_job",
            "view_own_applications",
            "upload_resume",
            "take_interview"
        ],
        UserRole.RECRUITER: [
            "create_job",
            "view_jobs",
            "view_applications",
            "schedule_interview",
            "review_candidates",
            "create_questions"
        ],
        UserRole.DOMAIN_EXPERT: [
            "create_questions",
            "review_interviews",
            "evaluate_candidates",
            "manage_skills_database"
        ],
        UserRole.ADMIN: [
            "manage_users",
            "system_settings",
            "view_analytics",
            "manage_all_data"
        ]
    }
    
    @classmethod
    def has_permission(cls, user: User, permission: str) -> bool:
        """
        Check if user has specific permission
        """
        user_permissions = cls.get_user_permissions(user)
        return permission in user_permissions
    
    @classmethod
    def get_user_permissions(cls, user: User) -> List[str]:
        """
        Get all permissions for a user based on their role
        """
        base_permissions = cls.ROLE_PERMISSIONS.get(user.role, [])
        
        # Add inherited permissions from lower roles
        user_level = cls.ROLE_HIERARCHY.get(user.role, 0)
        inherited_permissions = []
        
        for role, level in cls.ROLE_HIERARCHY.items():
            if level < user_level:
                inherited_permissions.extend(cls.ROLE_PERMISSIONS.get(role, []))
        
        return list(set(base_permissions + inherited_permissions))
    
    @classmethod
    def check_role_access(cls, user: User, required_roles: List[UserRole]) -> bool:
        """
        Check if user has any of the required roles
        """
        return user.role in required_roles
    
    @classmethod
    def check_minimum_role(cls, user: User, minimum_role: UserRole) -> bool:
        """
        Check if user has minimum required role level
        """
        user_level = cls.ROLE_HIERARCHY.get(user.role, 0)
        required_level = cls.ROLE_HIERARCHY.get(minimum_role, 0)
        return user_level >= required_level
    
    @classmethod
    def validate_role_access(cls, user: User, required_roles: List[UserRole]):
        """
        Validate role access and raise exception if denied
        """
        if not cls.check_role_access(user, required_roles):
            allowed_roles = [role.value for role in required_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {allowed_roles}, Your role: {user.role.value}"
            )
    
    @classmethod
    def validate_permission(cls, user: User, permission: str):
        """
        Validate permission and raise exception if denied
        """
        if not cls.has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required permission: {permission}"
            )
    
    @classmethod
    def get_role_info(cls) -> Dict[str, Any]:
        """
        Get comprehensive role information for frontend
        """
        return {
            "roles": [role.value for role in UserRole],
            "hierarchy": {role.value: level for role, level in cls.ROLE_HIERARCHY.items()},
            "permissions": {role.value: perms for role, perms in cls.ROLE_PERMISSIONS.items()}
        }

# Convenience functions for common role checks
def is_admin(user: User) -> bool:
    """Check if user is admin"""
    return user.role == UserRole.ADMIN

def is_recruiter_or_above(user: User) -> bool:
    """Check if user is recruiter or higher"""
    return RoleManager.check_minimum_role(user, UserRole.RECRUITER)

def is_domain_expert_or_above(user: User) -> bool:
    """Check if user is domain expert or higher"""
    return RoleManager.check_minimum_role(user, UserRole.DOMAIN_EXPERT)

def can_manage_jobs(user: User) -> bool:
    """Check if user can manage jobs"""
    return RoleManager.has_permission(user, "create_job")

def can_view_applications(user: User) -> bool:
    """Check if user can view job applications"""
    return RoleManager.has_permission(user, "view_applications")