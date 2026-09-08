package org.apache.felix.sample;

import org.osgi.service.component.annotations.*;
import org.osgi.service.metatype.annotations.Designate;

// @Component in a comment must not become workspace evidence.
@Component
@Designate(ocd = HealthCheckConfiguration.class)
public class HealthCheck {
    private final String example = "@Reference is text";

    @Reference
    void bind(Runnable service) {}
}
