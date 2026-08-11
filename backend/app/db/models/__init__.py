from app.db.models.collection_point import CollectionPoint
from app.db.models.driver_notification import DriverNotification
from app.db.models.daily_plan import DailyPlan
from app.db.models.driver import Driver
from app.db.models.optimized_route import OptimizedRoute
from app.db.models.parish import Parish
from app.db.models.pending_visit import PendingVisit
from app.db.models.plan_version import PlanVersion
from app.db.models.road_node import RoadNode
from app.db.models.road_segment import RoadSegment
from app.db.models.route_waypoint import RouteWaypoint
from app.db.models.sector import Sector
from app.db.models.simulation import Simulation
from app.db.models.system_alert import AlertActivity, SystemAlert
from app.db.models.system_settings import AuditLog, SystemSettings
from app.db.models.user import User, UserRole
from app.db.models.user_preferences import UserPreferences, UserSession
from app.db.models.vehicle import Vehicle
from app.db.models.vehicle_incident import VehicleIncident
from app.db.models.visit_schedule import VisitSchedule
from app.db.models.weekly_plan import WeeklyPlan, WeeklyPlanDay

__all__ = [
    "Parish",
    "Sector",
    "RoadNode",
    "RoadSegment",
    "CollectionPoint",
    "Vehicle",
    "Driver",
    "OptimizedRoute",
    "RouteWaypoint",
    "Simulation",
    "SystemAlert",
    "AlertActivity",
    "SystemSettings",
    "AuditLog",
    "User",
    "UserPreferences",
    "UserSession",
    "UserRole",
    "VehicleIncident",
    "WeeklyPlan",
    "WeeklyPlanDay",
    "DailyPlan",
    "PendingVisit",
    "VisitSchedule",
    "PlanVersion",
    "DriverNotification",
]
