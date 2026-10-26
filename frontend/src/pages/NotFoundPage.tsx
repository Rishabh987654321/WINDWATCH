import React from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-md mx-auto my-16 text-center space-y-6">
      <Card headerColor="pink" headerTitle="404 — Page Not Found">
        <div className="py-6 space-y-4">
          <div className="font-['Archivo_Black'] text-6xl text-[#FF6B9E]">
            404
          </div>
          <p className="font-['Space_Grotesk'] font-bold text-sm text-[#111]">
            The route you navigated to does not exist in WindWatch.
          </p>
          <div className="pt-2">
            <Link to="/">
              <Button variant="primary" size="md">
                RETURN TO OVERVIEW
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NotFoundPage;
