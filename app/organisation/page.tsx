'use client';

import { useEffect, useState } from 'react';

export default function Organisation() {
    const [orgData, setOrgData] = useState<any>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Fetch organisation
        fetch('/api/organisation')
            .then((res) => {
                if (!res.ok) throw new Error(`Organisation: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                console.log('Organisation data:', data);
                setOrgData(data);
            })
            .catch((e) => setError(e.message));

        // Fetch projects
        fetch('/api/projects-inprogress')
            .then((res) => {
                if (!res.ok) throw new Error(`Projects: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                setProjects(data);
            })
            .catch((e) => setError(e.message));
    }, []);

    const projectMap: Record<string, { id: string; name: string; status: string }> = {};

    projects.forEach((proj) => {
        const prefix = proj.name.split(" ")[0]; // Or use regex like proj.name.match(/^NY\d+/)
        projectMap[prefix] = {
            id: proj.projectId,
            name: proj.name,
            status: proj.status
        };
    });

    console.log('Project map:', projectMap);

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="p-10 bg-white rounded-lg shadow-xl text-center">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-black">{error}</p>
                </div>
            </div>
        );
    }

    if (!orgData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="p-10 bg-white rounded-lg shadow-xl text-center">
                    <p className="text-xl font-semibold text-black">Loading…</p>
                </div>
            </div>
        );
    }

    const orgName = orgData.Organisations?.[0]?.Name || 'Organisation';

    return (
        <div className="min-h-screen flex flex-col px-4 sm:px-6 lg:px-8 bg-white">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-base font-semibold text-gray-900">{orgName}</h1>
                    <p className="mt-2 text-sm text-gray-700">
                    Projects in Progress ({projects.length})
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                </div>
            </div>
            <div className="mt-8 flex-grow overflow-hidden">
                <div className="h-[calc(100vh-200px)] overflow-auto">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead className="sticky top-0 bg-white">
                                <tr>
                                    <th
                                    scope="col"
                                    className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-0"
                                    >
                                    Project Name
                                    </th>
                                    <th
                                    scope="col"
                                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                                    >
                                    Project ID
                                    </th>
                                    <th
                                    scope="col"
                                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                                    >
                                    Status
                                    </th>
                                    <th
                                    scope="col"
                                    className="relative py-3.5 pr-4 pl-3 sm:pr-0"
                                    >
                                    
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                            {projects.map((project) => (
                                <tr key={project.projectId}>
                                    <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-0">
                                        {project.name}
                                    </td>
                                    <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                                        {project.projectId}
                                    </td>
                                    <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                                        In Progress
                                    </td>
                                    <td className="relative py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                                        <a href="#" className="text-indigo-600 hover:text-indigo-900">
                                        Edit<span className="sr-only">, {project.name}</span>
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
