package example.internal;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component
public class Component {
    @Reference
    void bind(Runnable service) {}
}
