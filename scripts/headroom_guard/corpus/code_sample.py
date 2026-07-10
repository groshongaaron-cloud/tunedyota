def resolve_calibration(tier):
    table = {"light": 1, "mild": 2, "medium": 3, "spicy": 4}
    if tier not in table:
        return None
    return table[tier]
