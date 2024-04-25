from pydantic_settings import BaseSettings


class Settings(BaseSettings): 
    datasets_mapping_file: str


settings = Settings()