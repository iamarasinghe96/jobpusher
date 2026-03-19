"""
Location definitions for job searches.
Covers Albury/Wodonga region (76km radius), Vline corridor, and Melbourne.
"""

# Albury/Wodonga region - roughly 76km radius
ALBURY_REGION = [
    "Albury NSW 2640",
    "Wodonga VIC 3690",
    "Wangaratta VIC 3677",
    "Benalla VIC 3672",
    "Corowa NSW 2646",
    "Yarrawonga VIC 3730",
    "Beechworth VIC 3747",
    "Myrtleford VIC 3737",
    "Chiltern VIC 3683",
    "Rutherglen VIC 3685",
    "Bright VIC 3741",
]

# Key Vline corridor towns between Albury and Melbourne
VLINE_CORRIDOR = [
    "Seymour VIC 3660",
    "Benalla VIC 3672",
    "Wangaratta VIC 3677",
    "Wodonga VIC 3690",
]

# Melbourne
MELBOURNE = [
    "Melbourne VIC 3000",
]

# All locations combined (deduplicated)
ALL_LOCATIONS = list(dict.fromkeys(ALBURY_REGION + VLINE_CORRIDOR + MELBOURNE))

# Seek-specific region slugs (used in Seek URLs)
SEEK_REGIONS = {
    "Albury": "albury-wodonga",
    "Wodonga": "albury-wodonga",
    "Wangaratta": "wangaratta",
    "Benalla": "wangaratta",       # Benalla falls under Wangaratta area
    "Melbourne": "melbourne",
}

# Short labels for display
LOCATION_LABELS = {
    "albury_region": "Albury Region (76km)",
    "vline_corridor": "Vline Corridor",
    "melbourne": "Melbourne",
    "remote": "Remote / WFH",
}
