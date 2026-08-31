import * as path from 'path';
import * as fs from 'fs';

/**
 * A bnd workspace is identified by the presence of cnf/build.bnd.
 * Walks upward from startPath looking for that marker.
 */
export async function findWorkspaceRoot(startPath: string): Promise<string | undefined> {
    let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);

    while (true) {
        const marker = path.join(current, 'cnf', 'build.bnd');
        if (fs.existsSync(marker)) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            // Reached the filesystem root without finding cnf/build.bnd.
            return undefined;
        }
        current = parent;
    }
}

/**
 * A bnd project is identified by the presence of bnd.bnd in its own
 * directory. Walks upward from startPath looking for that marker,
 * stopping if it crosses into a bnd workspace root without finding one
 * (a project should not live above its own bnd.bnd).
 */
export async function findProjectRoot(startPath: string): Promise<string | undefined> {
    let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);

    while (true) {
        const marker = path.join(current, 'bnd.bnd');
        if (fs.existsSync(marker)) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}
