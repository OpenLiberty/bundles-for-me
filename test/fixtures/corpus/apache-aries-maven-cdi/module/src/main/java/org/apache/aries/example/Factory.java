package org.apache.aries.example;

import jakarta.enterprise.inject.Produces;
import org.apache.aries.blueprint.annotation.Bean;

@Bean
public class Factory {
    @Produces
    Object create() { return new Object(); }
}
