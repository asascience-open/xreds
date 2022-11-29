

def get_parameters(parameters: str) -> list[str]:
    """
    Extracts the parameter name(s) from the expression
    """
    return parameters.split(':')